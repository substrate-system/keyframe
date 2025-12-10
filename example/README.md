# C2PA Examples

This directory contains examples demonstrating how to work with C2PA (Coalition for Content Provenance and Authenticity) metadata using the `@contentauth/c2pa-web` library.

## Running the Examples

### Browser Examples

Run the interactive browser examples with Vite:

```bash
npm run example:browser
# or
npm start
```

Then open your browser to the displayed URL (typically http://localhost:5173).

The browser examples demonstrate:
- Creating signed markdown with C2PA manifests
- Validating C2PA data from images
- Embedding C2PA manifests in HTML
- Reading and displaying C2PA data

### Node.js Example Patterns

View Node.js code patterns and usage examples:

```bash
npm run example:node
```

**Important**: `@contentauth/c2pa-web` requires a browser environment (uses Web Workers). The Node.js script displays code patterns for how you would work with C2PA in Node.js using:
- A hypothetical Node.js-compatible library
- The Rust C2PA CLI tool
- Headless browser (Puppeteer/Playwright)

The patterns demonstrate:
- Validating C2PA data from image files
- Building and signing C2PA manifests
- Using the C2PA CLI tool from Node.js

## Examples Overview

### c2pa-examples.ts

Contains 7 examples:

1. **createSignedMarkdown()** - Create signed markdown with C2PA manifest
2. **validateImageC2PA()** - Validate C2PA data from an image
3. **embedInHTML()** - Embed C2PA manifest in HTML
4. **completeWorkflow()** - Complete workflow combining signing and validation
5. **readAndDisplay()** - Read and display C2PA data from images
6. **embedC2PAInImage()** - Build C2PA metadata for images (shows structure)
7. **nodeFileExample()** - Node.js filesystem pattern example

### node-runner.ts

Standalone Node.js script with focused examples:

1. **validateImageFromURL()** - Fetch and validate C2PA from remote images
2. **buildManifestExample()** - Create C2PA manifests using the Builder API
3. **showFileSystemPattern()** - Example code for working with local files

## Important Notes

### Signing Requirements

To fully sign images with C2PA metadata, you need:

1. **Valid X.509 Certificate** - C2PA requires certificate-based signing (not just Ed25519 keys)
2. **Signer Implementation** - Implement the `Signer` interface:
   ```typescript
   const signer = {
       alg: 'es256', // or 'ps256', etc.
       async sign(data: Uint8Array, reserveSize: number): Promise<Uint8Array> {
           // Sign with your certificate's private key
           return signedData;
       },
       async reserveSize(): Promise<number> {
           return 10000; // Bytes to reserve for signature
       }
   };
   ```
3. **Call builder.sign()** - Use the builder to sign and embed the manifest:
   ```typescript
   const signedBytes = await builder.sign(signer, 'image/jpeg', imageBlob);
   ```

The examples show the complete workflow but explain where certificate-based signing is required.

### Browser vs Node.js

- **Browser**: The `@contentauth/c2pa-web` library works natively in browsers
  - Use Vite dev server (`npm run example:browser`)
  - Full support for reading, validating, and building C2PA manifests
  - Interactive examples with real C2PA data

- **Node.js**: Requires alternative approaches
  - `@contentauth/c2pa-web` uses Web Workers (browser-only)
  - Options for Node.js:
    1. **Rust C2PA CLI** - Production-ready, call via child_process
    2. **Headless browser** - Use Puppeteer/Playwright to run c2pa-web
    3. **Future c2pa-node** - Watch for Node.js-native packages
  - Run `npm run example:node` to see code patterns

## API Documentation

See the [C2PA Web Documentation](https://opensource.contentauthenticity.org/docs/js-sdk/modules/_contentauth_c2pa_web) for full API details.

## Test Images

Examples use the official C2PA test image:
- https://spec.c2pa.org/public-testfiles/image/jpeg/adobe-20220124-C.jpg

More test files available at: https://spec.c2pa.org/public-testfiles/
