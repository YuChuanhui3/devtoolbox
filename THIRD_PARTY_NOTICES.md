# Third-party source notices

The native Whiteboard and PDF workspaces in `src/native-workspaces/whiteboard` and
`src/native-workspaces/pdf` are derived from the Whiteboard and PDF Editor applications
in the user's local `everything/src` checkout (HeyPuter applications).

These modules are licensed under **AGPL-3.0-only**, not the root MIT license. Their full
license texts, upstream READMEs and additional notices are retained alongside the source.
Modified files add route-owned DOM scopes, native lifecycle mounting, scoped styles,
webtool asset paths and integration with webtool navigation. No hosted application or
iframe is used to run either editor.

The corresponding source is included in this repository. When distributing or operating
a modified combined application, retain these notices and the AGPL source availability
requirements. Other original webtool source retains its existing MIT notices.

The `tests/native` regression tests are derived from the same upstream applications and
follow their AGPL-3.0-only licenses.

PDF.js, pdf-lib, fontkit, Tesseract, Yjs, Lucide and font assets retain their upstream
licenses. The PDF public font folder contains its upstream font license files. Liberation
standard-font source is included under `public/native/pdf/pdfjs/standard_fonts/liberation-source`.
The build copies decoder and OCR license files alongside their runtime assets.
