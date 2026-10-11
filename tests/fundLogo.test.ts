import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogoDraftReader } from "../components/settings/fundLogo";
import { FundType, type Fund } from "../types";

// Holds each read until the test finishes it, so edits can land while the file is still being read.
const reads: FakeFileReader[] = [];

class FakeFileReader {
  result: string | null = null;
  onloadend: (() => void) | null = null;

  readAsDataURL() {
    reads.push(this);
  }

  finish(dataUrl: string) {
    this.result = dataUrl;
    this.onloadend?.();
  }
}

const logo = { type: "image/png", size: 1024 } as unknown as File;

function draftStore(initial: Partial<Fund>) {
  let draft = initial;
  const setDraft = (update: Partial<Fund> | ((prev: Partial<Fund>) => Partial<Fund>)) => {
    draft = typeof update === "function" ? update(draft) : update;
  };
  return { current: () => draft, setDraft };
}

afterEach(() => {
  reads.length = 0;
  vi.unstubAllGlobals();
});

describe("fund logo read", () => {
  it("keeps edits made while the logo is still being read", () => {
    vi.stubGlobal("FileReader", FakeFileReader);
    const store = draftStore({ _id: "fund-1", name: "Harvest", type: FundType.UNRESTRICTED });

    const readLogo = createLogoDraftReader(store.setDraft, () => true);
    readLogo(logo, "fund-1");
    store.setDraft({ ...store.current(), name: "Harvest 2026", targetAmount: 500 });
    reads[0].finish("data:image/png;base64,AAA");

    expect(store.current()).toEqual({
      _id: "fund-1",
      name: "Harvest 2026",
      type: FundType.UNRESTRICTED,
      targetAmount: 500,
      logoUrl: "data:image/png;base64,AAA",
    });
  });

  it("drops a read that lands after the sheet closed", () => {
    vi.stubGlobal("FileReader", FakeFileReader);
    const store = draftStore({ name: "New fund", type: FundType.UNRESTRICTED });
    let open = true;

    const readLogo = createLogoDraftReader(store.setDraft, () => open);
    readLogo(logo, undefined);
    open = false;
    reads[0].finish("data:image/png;base64,AAA");

    expect(store.current().logoUrl).toBeUndefined();
  });

  it("drops a read for a draft that has since been replaced", () => {
    vi.stubGlobal("FileReader", FakeFileReader);
    const store = draftStore({ _id: "fund-1", name: "Harvest", type: FundType.UNRESTRICTED });

    const readLogo = createLogoDraftReader(store.setDraft, () => true);
    readLogo(logo, "fund-1");
    store.setDraft({ _id: "fund-2", name: "Building", type: FundType.RESTRICTED });
    reads[0].finish("data:image/png;base64,AAA");

    expect(store.current()).toEqual({ _id: "fund-2", name: "Building", type: FundType.RESTRICTED });
  });

  it("keeps the newest pick when the earlier read finishes last", () => {
    vi.stubGlobal("FileReader", FakeFileReader);
    const store = draftStore({ _id: "fund-1", name: "Harvest", type: FundType.UNRESTRICTED });
    const readLogo = createLogoDraftReader(store.setDraft, () => true);

    readLogo(logo, "fund-1");
    readLogo(logo, "fund-1");
    reads[1].finish("data:image/png;base64,BBB");
    reads[0].finish("data:image/png;base64,AAA");

    expect(store.current().logoUrl).toBe("data:image/png;base64,BBB");
  });

  it("applies the newest pick when it finishes first and the earlier one lands later", () => {
    vi.stubGlobal("FileReader", FakeFileReader);
    const store = draftStore({ _id: "fund-1", name: "Harvest", type: FundType.UNRESTRICTED });
    const readLogo = createLogoDraftReader(store.setDraft, () => true);

    readLogo(logo, "fund-1");
    readLogo(logo, "fund-1");
    reads[1].finish("data:image/png;base64,BBB");

    expect(store.current().logoUrl).toBe("data:image/png;base64,BBB");

    reads[0].finish("data:image/png;base64,AAA");
    expect(store.current().logoUrl).toBe("data:image/png;base64,BBB");
  });
});
