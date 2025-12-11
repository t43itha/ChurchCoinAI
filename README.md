<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1sDhTn3BB6kg5CNiS48vz-t1GG-zsKku_

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Create a `.env.local` for frontend values (see `.env.example`), e.g.:
   - `VITE_CONVEX_URL=...`
   - `VITE_CLERK_PUBLISHABLE_KEY=...`
3. Set `GEMINI_API_KEY` **only in the Convex backend environment**
   (Convex Dashboard or `npx convex env set GEMINI_API_KEY ...`).
   Do **not** put it in any Vite/`VITE_*` env file.
4. Run the app:
   `npm run dev`
