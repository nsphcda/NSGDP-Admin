# NSGDP Admin Portal

Super admin and staff portal for the Niger State GeoHealth Data Portal.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3002. The API URL comes from `NEXT_PUBLIC_API_URL` (include the `/api/v1` prefix).

Optional: set `NEXT_PUBLIC_PORTAL_URL` to the public portal's address to get a "View on portal" link on published Learning Hub guides.

## Learning Hub

The **Learning Hub** page (sidebar, needs the `manage:learning` permission or super admin) edits everything the portal's Learning Hub shows: guides, learning paths, videos, FAQs, glossary, templates and platform updates, plus a media library for screenshots and videos.

- Items are created as drafts; only published items are visible on the portal.
- Images upload through the API (PNG, JPEG, WebP, up to 5 MB). Videos (MP4, WebM) upload straight to storage, so the storage bucket needs a CORS rule allowing this admin origin (see the backend `docs/DEPLOYMENT.md`, Learning Hub section).
- **Import built-in content** adds any shipped item that is missing and never overwrites edits.
