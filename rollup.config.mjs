import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

const external = []; // Keep empty for a fully-bundled, drop-in build (easy reuse).

export default [
  // ESM build (best for modern bundlers + tree shaking)
  {
    input: 'src/index.ts',
    external,
    output: {
      dir: 'dist/esm',
      format: 'es',
      sourcemap: true,
      entryFileNames: 'index.js'
    },
    plugins: [
      resolve({ browser: true }),
      commonjs(),
      typescript({ 
        tsconfig: './tsconfig.json',
        declaration: true,
        declarationDir: 'dist/esm/types',
        outDir: 'dist/esm'
      })
    ]
  },

  // Single-file IIFE build for quick <script> usage in non-bundled pages
  {
    input: 'src/register.ts',
    external,
    output: {
      file: 'dist/iife/visual-block-editor.iife.js',
      format: 'iife',
      name: 'VisualBlockEditor',
      sourcemap: true,
      inlineDynamicImports: true
    },
    plugins: [
      resolve({ browser: true }),
      commonjs(),
      typescript({ 
        tsconfig: './tsconfig.json',
        declaration: false,
        declarationMap: false,
        outDir: 'dist/iife'
      }),
      terser()
    ]
  }
];
