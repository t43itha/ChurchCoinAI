type RenderPdfFromHtmlOptions = {
  html: string;
  pageFormat?: 'a4';
  scale?: number;
};

type SavePdfBlobOptions = {
  blob: Blob;
  filename: string;
};

type DownloadPdfBlobOptions = {
  blob: Blob;
  filename: string;
};

type SharePdfBlobOptions = {
  blob: Blob;
  filename: string;
  title?: string;
  text?: string;
};

type PdfRuntimeDeps = {
  html2canvas: (element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>;
  jsPDF: new (options?: Record<string, unknown>) => {
    internal: {
      pageSize: {
        getWidth: () => number;
        getHeight: () => number;
      };
    };
    addImage: (
      imageData: string,
      format: string,
      x: number,
      y: number,
      width: number,
      height: number
    ) => void;
    addPage: () => void;
    output: (type: 'blob') => Blob;
  };
};

let pdfRuntimeDeps: Promise<PdfRuntimeDeps> | null = null;

const loadPdfRuntimeDeps = (): Promise<PdfRuntimeDeps> => {
  if (!pdfRuntimeDeps) {
    pdfRuntimeDeps = Promise.all([import('html2canvas'), import('jspdf')]).then(
      ([html2canvasModule, jspdfModule]) => ({
        html2canvas: html2canvasModule.default,
        jsPDF: jspdfModule.jsPDF,
      })
    );
  }

  return pdfRuntimeDeps;
};

const ensurePdfExtension = (filename: string) => (filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`);

const ensureHtmlHasTitle = (html: string, title: string) => {
  if (/<title>.*?<\/title>/i.test(html)) {
    return html.replace(/<title>.*?<\/title>/i, `<title>${title}</title>`);
  }

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, match => `${match}\n<title>${title}</title>`);
  }

  return `<title>${title}</title>\n${html}`;
};

const buildHtmlForCapture = (html: string) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Wrap body contents so we can reliably capture full height.
  const wrapper = doc.createElement('div');
  wrapper.id = 'pdf-root';
  while (doc.body.firstChild) wrapper.appendChild(doc.body.firstChild);
  doc.body.appendChild(wrapper);

  // Add capture-specific layout so screen rendering matches A4 print layout more closely.
  const captureStyle = doc.createElement('style');
  captureStyle.textContent = `
    html, body { background: #ffffff !important; }
    #pdf-root {
      width: 210mm;
      box-sizing: border-box;
      padding: 20mm;
      background: #ffffff;
    }
  `;
  doc.head.appendChild(captureStyle);

  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
};

const waitForImages = async (doc: Document) => {
  const images = Array.from(doc.images || []);
  if (images.length === 0) return;
  await Promise.all(
    images.map(
      img =>
        new Promise<void>(resolve => {
          if (img.complete) return resolve();
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
        })
    )
  );
};

export const renderPdfBlobFromHtml = async ({ html, pageFormat = 'a4', scale = 2 }: RenderPdfFromHtmlOptions) => {
  const { html2canvas, jsPDF } = await loadPdfRuntimeDeps();

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '210mm';
  iframe.style.height = '297mm';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';

  const htmlForCapture = buildHtmlForCapture(html);
  iframe.srcdoc = htmlForCapture;
  document.body.appendChild(iframe);

  const cleanup = () => {
    try {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    } catch {
      // ignore
    }
  };

  const doc = await new Promise<Document>((resolve, reject) => {
    iframe.addEventListener(
      'load',
      () => {
        const loadedDoc = iframe.contentDocument;
        if (!loadedDoc) reject(new Error('PDF iframe did not load a document'));
        else resolve(loadedDoc);
      },
      { once: true }
    );
    iframe.addEventListener('error', () => reject(new Error('Failed to load PDF iframe')), { once: true });
  });

  try {
    try {
      await (doc as any).fonts?.ready;
    } catch {
      // ignore
    }
    await waitForImages(doc);

    const root = doc.getElementById('pdf-root');
    if (!root) throw new Error('PDF root element not found');

    iframe.contentWindow?.scrollTo(0, 0);

    const canvas = await html2canvas(root as HTMLElement, {
      backgroundColor: '#ffffff',
      scale,
      useCORS: true,
      logging: false,
    });

    const imageData = canvas.toDataURL('image/png');

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: pageFormat,
      compress: true,
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imageWidth = pageWidth;
    const imageHeight = (canvas.height * imageWidth) / canvas.width;

    let offsetY = 0;
    pdf.addImage(imageData, 'PNG', 0, offsetY, imageWidth, imageHeight);

    let remaining = imageHeight - pageHeight;
    while (remaining > 0) {
      offsetY -= pageHeight;
      pdf.addPage();
      pdf.addImage(imageData, 'PNG', 0, offsetY, imageWidth, imageHeight);
      remaining -= pageHeight;
    }

    return pdf.output('blob');
  } finally {
    cleanup();
  }
};

export const savePdfBlob = async ({ blob, filename }: SavePdfBlobOptions) => {
  const filenameWithExt = ensurePdfExtension(filename);

  const anyWindow = window as any;
  if (typeof anyWindow.showSaveFilePicker === 'function') {
    try {
      const handle = await anyWindow.showSaveFilePicker({
        suggestedName: filenameWithExt,
        types: [
          {
            description: 'PDF Document',
            accept: { 'application/pdf': ['.pdf'] },
          },
        ],
      });

      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (error: any) {
      // User cancelled the dialog, or the API failed — fall back to normal download.
      if (error?.name === 'AbortError') return false;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filenameWithExt;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
};

export const downloadPdfBlob = ({ blob, filename }: DownloadPdfBlobOptions) => {
  const filenameWithExt = ensurePdfExtension(filename);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filenameWithExt;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const sharePdfBlob = async ({ blob, filename, title, text }: SharePdfBlobOptions) => {
  const filenameWithExt = ensurePdfExtension(filename);
  const file = new File([blob], filenameWithExt, { type: 'application/pdf' });

  const anyNavigator = navigator as any;
  if (!navigator.share) return false;
  if (typeof anyNavigator.canShare === 'function' && !anyNavigator.canShare({ files: [file] })) return false;

  try {
    await navigator.share({ files: [file], title, text });
    return true;
  } catch {
    return false;
  }
};

export const ensureHtmlTitleForPdf = (html: string, filename: string) => ensureHtmlHasTitle(html, filename);
