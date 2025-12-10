import Debug from '@substrate-system/debug'
import { createC2pa } from '@contentauth/c2pa-web'
import wasmSrc from '@contentauth/c2pa-web/resources/c2pa.wasm?url'
import {
    generateKeypair,
    signContentC2PA,
    validateC2PAFromImage,
    type TSAConfig,
} from '../signed-content.js'
const debug = Debug('webts')

if (import.meta.env.DEV || import.meta.env.MODE === 'staging') {
    localStorage.setItem('DEBUG', 'webts')
} else {
    localStorage.removeItem('DEBUG')
}

/**
 * Example: Using @contentauth/c2pa-web for validation
 *
 * This shows how to:
 * 1. Create signed content with C2PA manifests
 * 2. Validate C2PA data from images using @contentauth/c2pa-web
 * 3. Integrate both signing and validation workflows
 */

// ============================================================================
// Setup
// ============================================================================

const TSA_CONFIG: TSAConfig = {
    url: 'https://freetsa.org/tsr',
}

// ============================================================================
// Example 1: Create signed markdown with C2PA manifest
// ============================================================================

async function createSignedMarkdown () {
    debug('Example 1: Create Signed Markdown with C2PA Manifest\n')

    const keypair = await generateKeypair()

    const content = `# My Blog Post

This post has a C2PA-compliant manifest that proves:
- I wrote it (Ed25519 signature)
- When I wrote it (RFC 3161 timestamp)
- It hasn't been modified (hash integrity)
`

    const { signature, manifest } = await signContentC2PA(
        content,
        keypair,
        TSA_CONFIG,
        {
            title: 'My Blog Post',
            author: 'nichoth',
            description: 'A signed blog post with C2PA provenance',
        }
    )

    debug('Created C2PA manifest:')
    debug(JSON.stringify(manifest, null, 2))
    debug('\nSignature:', signature.signature.substring(0, 32) + '...')
    debug('Verified timestamp:', signature.verifiedTimestamp)
}

// ============================================================================
// Example 2: Validate C2PA data from an image
// ============================================================================

async function validateImageC2PA () {
    debug('\nExample 2: Validate C2PA from Image\n')

    // Initialize c2pa-web
    const c2pa = await createC2pa({ wasmSrc })

    // Fetch a test image with C2PA data
    const response = await fetch(
        'https://spec.c2pa.org/public-testfiles/image/jpeg/adobe-20220124-C.jpg'
    )
    const blob = await response.blob()

    try {
        // Validate the C2PA manifest
        const validation = await validateC2PAFromImage(blob, c2pa)

        debug('Validation result:', validation.valid ? 'VALID' : 'INVALID')

        if (validation.manifest) {
            debug('\nManifest title:', validation.manifest.title)
            debug('Claim generator:', validation.manifest.claim_generator)
            debug('Number of assertions:', validation.manifest.assertions?.length || 0)
        }
    } catch (error) {
        debug('\nValidation error:', error instanceof Error ? error.message : String(error))
    }
}

// ============================================================================
// Example 3: Embed C2PA manifest in HTML
// ============================================================================

async function embedInHTML () {
    debug('\nExample 3: Embed C2PA Manifest in HTML\n')

    const keypair = await generateKeypair()

    const content = `# Understanding Cryptography

This article explains public-key cryptography...`

    const { signature, manifest } = await signContentC2PA(
        content,
        keypair,
        TSA_CONFIG,
        {
            title: 'Understanding Cryptography',
            author: 'nichoth',
        }
    )

    // Create HTML with embedded C2PA manifest
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${manifest.title}</title>
  
  <!-- C2PA Manifest as JSON-LD -->
  <script type="application/ld+json">
${JSON.stringify(manifest, null, 2)}
  </script>
</head>
<body>
  <article>
    <h1>${manifest.title}</h1>
    <div class="verification-badge">
      ✓ Cryptographically Signed
      <br>
      <small>Verified: ${signature.verifiedTimestamp}</small>
    </div>
    <div class="content">
      ${content}
    </div>
  </article>
</body>
</html>`

    debug('Generated HTML with embedded C2PA manifest')
    debug('HTML length:', html.length, 'bytes')
    debug('\nThe manifest can be:')
    debug('- Read by browsers (JSON-LD)')
    debug('- Validated by tools (c2pa-web)')
    debug('- Indexed by search engines')
}

// ============================================================================
// Example 4: Complete workflow - sign markdown + validate image
// ============================================================================

async function completeWorkflow () {
    debug('\nExample 4: Complete Workflow\n')

    const c2pa = await createC2pa({ wasmSrc })
    const keypair = await generateKeypair()

    // Step 1: Create signed markdown
    debug('Step 1: Create signed markdown content')
    const { manifest } = await signContentC2PA(
        '# My Article\n\nContent here...',
        keypair,
        TSA_CONFIG,
        { title: 'My Article', author: 'nichoth' }
    )
    debug('the manifest...', manifest)

    // Step 2: Validate an image with C2PA (simulating featured image)
    console.log('\nStep 2: Validate featured image')
    const imageResponse = await fetch(
        'https://spec.c2pa.org/public-testfiles/image/jpeg/adobe-20220124-C.jpg'
    )
    const imageBlob = await imageResponse.blob()

    try {
        const imageValidation = await validateC2PAFromImage(imageBlob, c2pa)
        debug('✓ Featured image C2PA:', imageValidation.valid ? 'VALID' : 'INVALID')
    } catch (error) {
        debug('✗ Featured image validation failed:', error instanceof Error ? error.message : String(error))
    }

    // Step 3: Combine both
    debug('\nStep 3: Complete blog post with verified assets')
    debug('- Markdown content: Signed with Ed25519 + TSA')
    debug('- Featured image: Validated C2PA manifest')
    debug('- Both have cryptographic proof of authenticity')
}

// ============================================================================
// Example 5: Read C2PA from image and display
// ============================================================================

async function readAndDisplay () {
    debug('\nExample 5: Read and Display C2PA Data\n')

    const c2pa = await createC2pa({ wasmSrc })

    // Fetch image with C2PA data
    const response = await fetch(
        'https://spec.c2pa.org/public-testfiles/image/jpeg/adobe-20220124-C.jpg'
    )
    const blob = await response.blob()

    // Create reader
    const reader = await c2pa.reader.fromBlob(blob.type, blob)
    if (!reader) throw new Error('not reader')
    const activeManifest = await reader.activeManifest()

    if (activeManifest) {
        debug('Image C2PA Data:')
        debug('- Title:', activeManifest.title)
        debug('- Claim Generator:', activeManifest.claim_generator)

        // Show assertions
        if (activeManifest.assertions) {
            debug('- Assertions:')
            activeManifest.assertions.forEach((assertion: any) => {
                debug(`  - ${assertion.label}`)
            })
        }

        // Show ingredients (if any)
        if (activeManifest.ingredients) {
            debug('- Ingredients:', activeManifest.ingredients.length)
        }
    }

    // Clean up
    await reader.free()
}

// ============================================================================
// Example 6: Add C2PA metadata to an image (Node.js)
// ============================================================================

/**
 * Example: Embed C2PA metadata into an image using the Builder API
 *
 * This example demonstrates:
 * - Fetching an image file
 * - Creating a C2PA manifest with the Builder API
 * - Signing and embedding metadata into the image
 * - Saving the result
 *
 * Note: This requires a signing certificate. For testing purposes,
 * we'll show the structure even without full signing capability.
 */
async function embedC2PAInImage () {
    debug('\nExample 6: Embed C2PA Metadata in Image\n')

    const c2pa = await createC2pa({ wasmSrc })

    // Step 1: Fetch the test image
    debug('Step 1: Fetching test image...')
    const imageResponse = await fetch(
        'https://spec.c2pa.org/public-testfiles/image/jpeg/adobe-20220124-C.jpg'
    )
    const imageBlob = await imageResponse.blob()
    debug('✓ Image fetched:', imageBlob.size, 'bytes')

    // Step 2: Create a builder
    debug('\nStep 2: Creating C2PA builder...')
    const builder = await c2pa.builder.new()

    // Step 3: Add actions (what was done to the image)
    debug('Step 3: Adding action metadata...')
    await builder.addAction({
        action: 'c2pa.edited',
        when: new Date().toISOString(),
        softwareAgent: {
            name: 'webts-example',
            version: '1.0.0',
        },
        parameters: {
            description: 'Added C2PA provenance metadata',
        },
    })

    // Step 4: Set thumbnail (optional)
    debug('Step 4: Setting thumbnail...')
    await builder.setThumbnailFromBlob('image/jpeg', imageBlob)

    // Step 5: Get the manifest definition to see what we've built
    const definition = await builder.getDefinition()
    debug('\nManifest Definition:')
    debug('- Title:', definition.title || 'Untitled')
    debug('- Claim Generator:', definition.claim_generator)
    debug('- Actions:', definition.assertions?.find(a => a.label === 'c2pa.actions'))

    debug('\n⚠️  Note: To fully sign the image, you need:')
    debug('   1. A valid X.509 certificate for signing')
    debug('   2. A Signer implementation with your private key')
    debug('   3. Call builder.sign(signer, "image/jpeg", imageBlob)')
    debug('\nExample signer implementation needed:')
    debug(`
const signer = {
    alg: 'es256',
    async sign(data, reserveSize) {
        // Sign the data with your certificate's private key
        // This would use crypto libraries like node:crypto or @peculiar/webcrypto
        return signedData;
    },
    async reserveSize() {
        return 10000; // Size to reserve for signature
    }
};

const signedImageBytes = await builder.sign(signer, 'image/jpeg', imageBlob);
    `)

    // Clean up
    await builder.free()
}

// ============================================================================
// Example 7: Create C2PA manifest for Node.js file operations
// ============================================================================

/**
 * Node.js example: Read image from filesystem, add C2PA, write to new file
 *
 * This shows the pattern for Node.js scripts that work with the filesystem.
 * Requires Node.js with fetch support (Node 18+) or undici for older versions.
 */
async function nodeFileExample () {
    debug('\nExample 7: Node.js File System Pattern\n')

    debug(`
// In a Node.js script with file system access:

import { readFile, writeFile } from 'fs/promises';
import { createC2pa } from '@contentauth/c2pa-web';
import wasmSrc from '@contentauth/c2pa-web/resources/c2pa.wasm?url';

async function addC2PAToImageFile(inputPath, outputPath) {
    // Read the image file
    const imageBuffer = await readFile(inputPath);
    const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' });

    // Initialize c2pa
    const c2pa = await createC2pa({ wasmSrc });

    // Create builder and add metadata
    const builder = await c2pa.builder.new();

    await builder.addAction({
        action: 'c2pa.edited',
        when: new Date().toISOString(),
        softwareAgent: { name: 'my-app', version: '1.0' }
    });

    // Sign the image (requires certificate)
    const signer = createMySigner(); // Your implementation
    const signedBytes = await builder.sign(signer, 'image/jpeg', imageBlob);

    // Write to output file
    await writeFile(outputPath, Buffer.from(signedBytes));

    await builder.free();
    console.log('✓ C2PA metadata added to', outputPath);
}

// Usage:
await addC2PAToImageFile(
    './example/adobe-20220124-C.jpg',
    './output/signed-image.jpg'
);
    `)

    debug('\n📝 Key points for Node.js usage:')
    debug('   • Use fs/promises for file I/O')
    debug('   • Convert Buffers to Blobs for c2pa-web API')
    debug('   • Ensure WASM file is accessible')
    debug('   • Implement proper certificate-based signing')
}

// ============================================================================
// Run examples
// ============================================================================

export async function runExamples () {
    try {
        await createSignedMarkdown()
        await validateImageC2PA()
        await embedInHTML()
        await completeWorkflow()
        await readAndDisplay()
        await embedC2PAInImage()
        await nodeFileExample()
    } catch (error) {
        debug('Error running examples:', error)
    }
}

export {
    createSignedMarkdown,
    validateImageC2PA,
    embedInHTML,
    completeWorkflow,
    readAndDisplay,
    embedC2PAInImage,
    nodeFileExample,
}
