# Signed Content Library

A TypeScript library for creating verifiable, timestamped content signatures using Ed25519 keypairs, RFC 3161 Time-Stamp Authorities, and C2PA manifests. Inspired by Secure Scuttlebutt's signed message chains, adapted for web publishing.

## Features

- **Ed25519 Signatures**: Fast, secure signing of markdown content
- **RFC 3161 Timestamps**: Trusted third-party time attestation from TSAs
- **C2PA Integration**: Industry-standard content provenance manifests
- **Merkle-List Structure**: Verifiable revision chains with hash linking
- **Web-Native**: Built on Web Crypto API, works in browsers and Node.js

## Concept

Every page on your website becomes a signed, timestamped document with a verifiable history:

1. **Sign** your content with your private key
2. **Timestamp** the signature via a trusted TSA (proves *when* it existed)
3. **Chain** revisions together (each edit references the previous hash)
4. **Verify** the entire history is authentic and unmodified

This creates a web version of Secure Scuttlebutt's message signing pattern, where every piece of content has cryptographic proof of authorship and creation time.

## Installation

```bash
npm install @contentauth/c2pa-web
```

Then include `signed-content.ts` in your project.

### Note on C2PA Libraries

- **@contentauth/c2pa-web**: For **reading and validating** C2PA data from images/media (browser + Node.js)
- **c2pa-node**: For **creating and signing** C2PA manifests and embedding them in media files (Node.js only)

This library uses `@contentauth/c2pa-web` to validate C2PA data from images. It creates C2PA-compliant manifest structures for markdown/text content that can be:
- Embedded in HTML as JSON-LD metadata
- Served as verification data
- Used with c2pa-node to embed in images (server-side)

## Quick Start

```typescript
import {
  generateKeypair,
  createSignedContent,
  addRevision,
  verifyChain,
  type TSAConfig,
} from './signed-content';

// Generate your keypair (do this once, store securely)
const keypair = await generateKeypair();

// Configure a Time-Stamp Authority
const tsaConfig: TSAConfig = {
  url: 'https://freetsa.org/tsr',
};

// Create your first signed post
const post = await createSignedContent(
  '# My Blog Post\n\nThis is my first signed post!',
  keypair,
  tsaConfig,
  {
    title: 'My First Post',
    author: 'Your Name',
  }
);

// Edit the post (creates a new revision in the chain)
const edited = await addRevision(
  post,
  '# My Blog Post\n\nThis is my edited post with more content!',
  keypair,
  tsaConfig
);

// Verify the entire revision chain
const { valid, errors } = await verifyChain(edited, keypair.publicKey);
console.log('Chain valid:', valid);

// Optional: Validate C2PA data from an image
import { createC2pa } from '@contentauth/c2pa-web';
import wasmSrc from '@contentauth/c2pa-web/resources/c2pa.wasm?url';

const c2pa = await createC2pa({ wasmSrc });
const imageBlob = await fetch('image.jpg').then(r => r.blob());
const validation = await validateC2PAFromImage(imageBlob, c2pa);
console.log('Image C2PA valid:', validation.valid);
```

## API Reference

### Core Functions

#### `generateKeypair(): Promise<Keypair>`
Generate a new Ed25519 keypair for signing.

```typescript
const keypair = await generateKeypair();
// Store keypair.privateKey securely!
// Publish keypair.publicKey on your website
```

#### `signContent(content: string, keypair: Keypair): Promise<ContentSignature>`
Sign content and return a basic signature (no TSA timestamp).

```typescript
const signature = await signContent(markdownContent, keypair);
console.log(signature.contentHash); // SHA-256 hash
console.log(signature.signature);   // Ed25519 signature
console.log(signature.timestamp);   // Client-claimed time (not verified)
```

#### `signContentWithTimestamp(content: string, keypair: Keypair, tsaConfig: TSAConfig): Promise<TimestampedSignature>`
Sign content and get a verified timestamp from a TSA.

```typescript
const signature = await signContentWithTimestamp(content, keypair, {
  url: 'https://freetsa.org/tsr',
});
console.log(signature.verifiedTimestamp); // TSA-verified time
console.log(signature.tsaToken);          // RFC 3161 token
```

#### `signContentC2PA(content, keypair, tsaConfig, metadata): Promise<{signature, manifest}>`
Create a C2PA-compliant manifest with embedded signatures and timestamps.

```typescript
const { signature, manifest } = await signContentC2PA(
  content,
  keypair,
  tsaConfig,
  {
    title: 'My Article',
    author: 'Your Name',
    description: 'Article description',
  }
);
```

#### `validateC2PAFromImage(imageBlob, c2paInstance): Promise<{valid, manifest, errors}>`
Validate C2PA data embedded in an image using @contentauth/c2pa-web.

```typescript
import { createC2pa } from '@contentauth/c2pa-web';
import wasmSrc from '@contentauth/c2pa-web/resources/c2pa.wasm?url';

const c2pa = await createC2pa({ wasmSrc });
const imageBlob = await fetch('photo.jpg').then(r => r.blob());
const { valid, manifest, errors } = await validateC2PAFromImage(imageBlob, c2pa);

if (valid) {
  console.log('Image is authentic');
  console.log('Created by:', manifest?.claim_generator);
} else {
  console.error('Validation failed:', errors);
}
```

### Revision Chain Functions

#### `createSignedContent(content, keypair, tsaConfig, metadata): Promise<SignedContent>`
Create the initial version of signed content.

```typescript
const signedContent = await createSignedContent(
  '# First Draft',
  keypair,
  tsaConfig
);
```

#### `addRevision(signedContent, newContent, keypair, tsaConfig): Promise<SignedContent>`
Add a new revision to the chain.

```typescript
const updated = await addRevision(
  signedContent,
  '# Second Draft\n\nWith more content',
  keypair,
  tsaConfig
);
```

#### `verifyChain(signedContent, publicKey): Promise<{valid: boolean, errors: string[]}>`
Verify the integrity of the entire revision chain.

```typescript
const { valid, errors } = await verifyChain(signedContent, publicKey);
if (!valid) {
  console.error('Chain invalid:', errors);
}
```

### Serialization Functions

#### `serializeSignedContent(signedContent): string`
Serialize to JSON for storage.

```typescript
const json = serializeSignedContent(signedContent);
await fs.writeFile('post.json', json);
```

#### `parseSignedContent(json): SignedContent`
Parse from JSON.

```typescript
const json = await fs.readFile('post.json', 'utf-8');
const signedContent = parseSignedContent(json);
```

#### `exportWithManifest(signedContent): {content, manifest, chainProof}`
Export in a format suitable for web publishing.

```typescript
const exported = exportWithManifest(signedContent);
// Include exported.manifest in your HTML meta tags
// Serve exported.chainProof for verification
```

## RFC 3161 Time-Stamp Authorities

Public TSAs you can use:

- **FreeTSA**: `https://freetsa.org/tsr` (free, rate-limited)
- **DigiCert**: `http://timestamp.digicert.com`
- **Apple**: `http://timestamp.apple.com/ts01`
- **Sectigo**: `http://timestamp.sectigo.com`

For production, consider:
- Running your own TSA server
- Using a commercial TSA service
- Implementing fallback to multiple TSAs

Note: TSAs may have rate limits. Cache timestamp tokens for better performance.

## C2PA Integration

The library creates C2PA-compliant manifests with:

- `c2pa.hash.data` - Content hash assertion
- `c2pa.actions` - Creation/edit actions with timestamps
- `stds.schema-org.CreativeWork` - Schema.org metadata
- `org.nichoth.signature` - Custom assertion with your signature and TSA token

You can embed these manifests in your web pages or export them separately for verification.

## Architecture

### Merkle-List Structure

Each revision includes:
```typescript
{
  content: "...",           // The markdown content
  signature: {
    contentHash: "abc123",  // SHA-256 of content
    signature: "def456",    // Ed25519 signature
    tsaToken: "ghi789",     // RFC 3161 timestamp token
    verifiedTimestamp: "2024-01-01T00:00:00Z"
  },
  previousHash: "xyz789"    // Links to previous revision
}
```

This creates a chain: `v1 -> v2 -> v3 -> ...` where each version cryptographically references its predecessor.

### Why Ed25519?

- Fast signing and verification
- Small signature size (64 bytes)
- Native browser support via Web Crypto API
- Secure by default (no parameter choices to mess up)

### Why RFC 3161?

Without a TSA, you can only prove you *have* a signature, not *when* it was created. You could backdate content by claiming an old timestamp.

A TSA provides trusted third-party attestation:
1. You send the hash to the TSA
2. TSA signs `(hash, current_time)` with their key
3. Anyone can verify the TSA's signature proves the hash existed at that time

The TSA never sees your content (only the hash), preserving privacy.

## Usage Patterns

### Pattern 1: Static Site Generation

```typescript
// At build time
const post = await createSignedContent(
  markdownSource,
  keypair,
  tsaConfig
);

// Generate HTML with embedded manifest
const html = `
<!DOCTYPE html>
<html>
<head>
  <script type="application/ld+json">
    ${JSON.stringify(post.c2paManifest)}
  </script>
</head>
<body>
  ${renderMarkdown(post.content)}
</body>
</html>
`;
```

### Pattern 2: Dynamic Editing

```typescript
// Load existing post
const existing = parseSignedContent(await fs.readFile('post.json'));

// User makes edits
const updated = await addRevision(existing, newContent, keypair, tsaConfig);

// Save updated version
await fs.writeFile('post.json', serializeSignedContent(updated));
```

### Pattern 3: Public Verification

```typescript
// Publish your public key at /.well-known/pubkey
app.get('/.well-known/pubkey', (req, res) => {
  res.json({ publicKey: bufferToHex(keypair.publicKey) });
});

// Let readers verify any post
app.get('/verify/:postId', async (req, res) => {
  const post = await loadPost(req.params.postId);
  const publicKey = hexToBuffer(await fetchPublicKey());
  const { valid, errors } = await verifyChain(post, publicKey);
  res.json({ valid, errors });
});
```

## Security Considerations

### Key Management

- **Never** commit private keys to version control
- Store private keys encrypted at rest
- Consider hardware security modules (HSMs) for high-value keys
- Use environment variables or secure vaults in production

### Timestamp Trust

- TSAs are trusted third parties - choose reputable providers
- Consider using multiple TSAs for critical content
- Verify TSA certificates before trusting timestamps
- Some TSAs may log requests - be aware of privacy implications

### Chain Integrity

- Always verify the entire chain before trusting content
- Check that `previousHash` values correctly link revisions
- Verify all signatures match the claimed public key
- Validate timestamp tokens with the TSA's public certificate

## Comparison to Secure Scuttlebutt

| Feature | SSB | This Library |
|---------|-----|--------------|
| **Network** | P2P gossip | HTTP/Web |
| **Identity** | Ed25519 keypair | Ed25519 keypair |
| **Message format** | JSON with signature | Markdown with C2PA |
| **Timestamps** | Local clock | RFC 3161 TSA |
| **Chaining** | Merkle chain | Merkle chain |
| **Storage** | Append-only log | Files/database |

Key difference: SSB relies on eventual consistency across peers, while this library creates standalone signed documents for web publishing.

## TypeScript Types

```typescript
interface Keypair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

interface ContentSignature {
  contentHash: string;
  signature: string;
  publicKey: string;
  timestamp: string;
}

interface TimestampedSignature extends ContentSignature {
  tsaToken: string;
  verifiedTimestamp: string;
}

interface ContentRevision {
  content: string;
  signature: TimestampedSignature;
  previousHash: string | null;
}

interface SignedContent {
  content: string;
  revisions: ContentRevision[];
  c2paManifest?: any;
}

interface TSAConfig {
  url: string;
  hashAlgorithm?: string;
  policyOID?: string;
}
```

## Browser vs Node.js

The library uses Web Crypto API which works in both environments:

**Browser:**
```typescript
import { generateKeypair, signContent } from './signed-content';
// Works directly
```

**Node.js:**
```typescript
import { webcrypto } from 'crypto';
globalThis.crypto = webcrypto;

import { generateKeypair, signContent } from './signed-content';
// Now works
```

## Production Considerations

### ASN.1 Encoding

The RFC 3161 implementation in this library is simplified. For production use, you should:

- Use a proper ASN.1 library like `@peculiar/asn1-schema`
- Implement full DER encoding for TimeStampReq
- Parse TimeStampResp properly to extract TSTInfo
- Verify TSA certificates

### Performance

- Cache TSA tokens (same content = same token)
- Consider batching multiple signatures with one TSA request
- Use Web Workers for signature verification in browsers
- Store revision chains efficiently (don't duplicate unchanged content)

### Monitoring

- Track TSA request success rates
- Alert on signature verification failures
- Log chain verification errors
- Monitor timestamp drift

## Future Enhancements

Potential additions to this library:

- WebAuthn integration for hardware key support
- Multi-signature support (threshold signatures)
- Conflict resolution for concurrent edits
- Integration with Git for version control
- IPFS/IPNS publishing support
- Blockchain anchoring for additional timestamp proof

## License

MIT

## Contributing

Contributions welcome! This is designed to be a solid foundation for signed web content.

## References

- [RFC 3161: Time-Stamp Protocol](https://www.rfc-editor.org/rfc/rfc3161)
- [C2PA Specifications](https://c2pa.org/specifications/specifications/1.0/specs/C2PA_Specification.html)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [Secure Scuttlebutt Protocol](https://ssbc.github.io/scuttlebutt-protocol-guide/)
- [Ed25519 Signature Scheme](https://ed25519.cr.yp.to/)
