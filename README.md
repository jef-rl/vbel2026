# Visual Block Editor (Lit + Rollup)

This repo splits the original single-file prototype into **reusable web components**.

## Goals

- **Reusable building blocks**: each component has one job (data/provider, editor, grid overlay, projection, etc.)
- **One-way data flow**: UI events bubble up to the provider; provider updates contexts; consumers re-render.
- **Drop-in distribution**:
  - `dist/esm/index.js` for bundlers
  - `dist/iife/visual-block-editor.iife.js` for direct `<script>` usage

## Install

```bash
npm i
npm run dev
```

## Build

```bash
npm run build
```

## Usage (bundled)

```ts
import {
  VisualBlockData,
  VisualBlockEditor,
  registerVisualBlockEditor
} from './dist/esm/index.js';

registerVisualBlockEditor();
```

Then in HTML:

```html
<visual-block-data base-url="https://example.com/blocks">
  <visual-block-editor></visual-block-editor>
</visual-block-data>
```

## Notes

- The original prototype referenced a Gemini endpoint directly in the browser. This repo keeps that *optional*
  via a pluggable `aiClient` function so you can swap to your own server/API proxy.
