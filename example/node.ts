import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Builder, LocalSigner, patchVerifyConfig } from '@contentauth/c2pa-node'
import type { Action } from '@contentauth/c2pa-types'

// Configure C2PA to allow self-signed certificates for testing
patchVerifyConfig({
    verifyTrust: false,              // Don't verify certificate trust chain
    verifyAfterSign: false,          // Don't verify after signing
    verifyTimestampTrust: false      // Don't verify timestamp trust
})

/**
 * Use Node JS to add metadata to an image file.
 */
async function start () {
    console.log('Adding C2PA metadata to image...\n')

    // Use process.cwd() for bundled code
    const baseDir = resolve(process.cwd(), 'example')
    const inputPath = resolve(baseDir, '20190814_102301.jpg')
    const outputPath = resolve(baseDir, 'output-signed.jpg')

    console.log('Input:', inputPath)
    console.log('Output:', outputPath)

    // Create the builder
    const builder = Builder.new()

    // Set the intent - we're creating original content
    builder.setIntent({
        create: 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture'
    })

    // Add an action assertion - stating that you created this image
    const action:Action = {
        action: 'c2pa.created',
        when: new Date().toISOString(),
        softwareAgent: {
            name: 'keyframe',
            version: '1.0.0'
        },
        description: 'Original image created by the author'
    }

    builder.addAction(JSON.stringify(action))

    // You can also add custom assertions
    builder.addAssertion('org.keyframe.author', JSON.stringify({
        name: 'Your Name',
        timestamp: new Date().toISOString(),
        claim: 'I created this image'
    }), 'Json')

    // Get the manifest to inspect it
    const manifest = builder.getManifestDefinition()
    console.log('\nManifest created:')
    console.log('- Claim generator:', manifest.claim_generator)
    console.log('- Assertions:', manifest.assertions?.map(a => a.label))

    // To sign the image, you need a certificate and private key
    // For testing, you can generate a self-signed certificate:
    // openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

    const certPath = resolve(baseDir, 'cert.pem')
    const keyPath = resolve(baseDir, 'key.pem')

    try {
        const certPem = await readFile(certPath)
        const keyPem = await readFile(keyPath)

        // Create signer with your certificate and private key
        const signer = LocalSigner.newSigner(
            certPem,      // certificate Buffer
            keyPem,       // private key Buffer
            'ps256'       // algorithm
        )

        // Sign the image
        console.log('\nSigning image...')
        builder.sign(
            signer,
            { path: inputPath, mimeType: 'image/jpeg' },
            { path: outputPath, mimeType: 'image/jpeg' }
        )

        console.log('✅ Image signed successfully!')
        console.log('   Output:', outputPath)
    } catch (error) {
        console.error('\n⚠️  Could not sign image:')
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            console.error('   file not found.')
            console.error('\n   To sign images, you need a certificate and private key.')
            console.error('   For testing, generate a self-signed certificate:')
            console.error('   ')
            console.error('   cd example')
            console.error('   openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=Test"')
            console.error('')
            console.error('cert path:', certPath)
            console.error('key path:', keyPath)
        } else {
            console.error('  ', (error as Error).message)
        }
    }
}

start().catch(console.error)

// async function addC2PAToImage (inputPath, outputPath) {
//     console.log('\n Adding C2PA metadata to image...\n')

//     // Read the input image
//     console.log('📖 Reading input image:', inputPath)
//     const imageBuffer = await readFile(inputPath)
//     const imageBase64 = imageBuffer.toString('base64')

//     // Launch headless browser
//     console.log('🌐 Launching headless browser...')
//     const browser = await puppeteer.launch({
//         headless: 'new',
//         args: ['--no-sandbox', '--disable-setuid-sandbox']
//     })

//     try {
//         const page = await browser.newPage()

//         // Enable console logs from the page
//         page.on('console', msg => {
//             const text = msg.text()
//             if (!text.includes('DevTools')) {
//                 console.log('   Browser:', text)
//             }
//         })

//         // Navigate to a data URL with our page content
//         console.log('📦 Loading c2pa-web library...')
//         await page.goto('data:text/html,<html><head></head><body></body></html>')

//         // Inject the c2pa-web library and process the image
//         const result = await page.evaluate(async (imageBase64Data) => {
//             // Load c2pa-web from CDN
//             const script = document.createElement('script')
//             script.type = 'module'
//             script.textContent = `
//                 import { createC2pa } from 'https://cdn.jsdelivr.net/npm/@contentauth/c2pa-web@latest/dist/c2pa.js';

//                 window.processImage = async function(imageBase64) {
//                     try {
//                         console.log('Initializing c2pa-web...');

//                         // Initialize c2pa
//                         const c2pa = await createC2pa({
//                             wasmSrc: 'https://cdn.jsdelivr.net/npm/@contentauth/c2pa-web@latest/dist/resources/c2pa_bg.wasm'
//                         });

//                         console.log('Creating builder...');

//                         // Convert base64 to blob
//                         const binaryString = atob(imageBase64);
//                         const bytes = new Uint8Array(binaryString.length);
//                         for (let i = 0; i < binaryString.length; i++) {
//                             bytes[i] = binaryString.charCodeAt(i);
//                         }
//                         const blob = new Blob([bytes], { type: 'image/jpeg' });

//                         // Create builder
//                         const builder = await c2pa.builder.new();

//                         // Add action metadata
//                         console.log('Adding C2PA metadata...');
//                         await builder.addAction({
//                             action: 'c2pa.edited',
//                             when: new Date().toISOString(),
//                             softwareAgent: {
//                                 name: 'webts-node-script',
//                                 version: '1.0.0'
//                             },
//                             parameters: {
//                                 description: 'Added C2PA provenance metadata via Node.js script'
//                             }
//                         });

//                         // Set thumbnail
//                         await builder.setThumbnailFromBlob('image/jpeg', blob);

//                         // Get the manifest definition
//                         const definition = await builder.getDefinition();
//                         console.log('Manifest created:', definition.claim_generator);

//                         await builder.free();

//                         // Note: Without a certificate, we can't actually sign the image
//                         // Return the original image for now
//                         // In production, you would call: builder.sign(signer, 'image/jpeg', blob)

//                         return {
//                             success: true,
//                             message: 'C2PA manifest created (signing requires certificate)',
//                             manifest: {
//                                 claimGenerator: definition.claim_generator,
//                                 vendor: definition.vendor,
//                                 assertions: definition.assertions?.map(a => a.label)
//                             },
//                             // For now, return original image since we can't sign without cert
//                             imageBase64: imageBase64
//                         };

//                     } catch (error) {
//                         return {
//                             success: false,
//                             error: error.message,
//                             stack: error.stack
//                         };
//                     }
//                 };
//             `
//             document.head.appendChild(script)

//             // Wait for the module to load
//             await new Promise(resolve => setTimeout(resolve, 2000))

//             // Process the image
//             if (typeof window.processImage === 'function') {
//                 return await window.processImage(imageBase64Data)
//             } else {
//                 throw new Error('processImage function not available')
//             }
//         }, imageBase64)

//         if (!result.success) {
//             throw new Error(result.error + '\n' + result.stack)
//         }

//         console.log('\n✅ C2PA Manifest Created:')
//         console.log('   Claim Generator:', result.manifest.claimGenerator)
//         console.log('   Vendor:', result.manifest.vendor || 'N/A')
//         console.log('   Assertions:', result.manifest.assertions?.length || 0)
//         if (result.manifest.assertions) {
//             result.manifest.assertions.forEach(label => {
//                 console.log('     •', label)
//             })
//         }

//         // Write output image
//         console.log('\n💾 Writing output image:', outputPath)
//         const outputBuffer = Buffer.from(result.imageBase64, 'base64')
//         await writeFile(outputPath, outputBuffer)

//         console.log('\n⚠️  Important Note:')
//         console.log('   To fully sign the image and embed the C2PA manifest,')
//         console.log('   you need a valid X.509 certificate.')
//         console.log('\n   The manifest structure was created successfully,')
//         console.log('   but signing requires:')
//         console.log('   1. A certificate from a trusted CA')
//         console.log('   2. The corresponding private key')
//         console.log('   3. Implementing the Signer interface')
//         console.log('\n   See the README for certificate setup instructions.\n')
//     } finally {
//         await browser.close()
//     }
// }

// // CLI Interface
// const args = process.argv.slice(2)

// if (args.length < 2) {
//     console.error('\n❌ Usage: node add-c2pa-to-image.js <input.jpg> <output.jpg>\n')
//     console.error('Example:')
//     console.error('  node example/add-c2pa-to-image.js input.jpg output.jpg\n')
//     process.exit(1)
// }

// const [inputPath, outputPath] = args.map(p => resolve(p))

// try {
//     await addC2PAToImage(inputPath, outputPath)
//     console.log('✅ Done!\n')
// } catch (error) {
//     console.error('\n❌ Error:', error.message)
//     console.error(error.stack)
//     process.exit(1)
// }
