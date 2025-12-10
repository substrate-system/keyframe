/**
 * Common utility functions for buffer/hex/base64 conversions
 * These work in both browser and Node.js environments
 */

/**
 * Convert Uint8Array to hex string
 */
export function bufferToHex (buffer:Uint8Array):string {
    return Array.from(buffer)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
}

/**
 * Convert hex string to Uint8Array
 */
export function hexToBuffer (hex:string):Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
    }
    return bytes
}

/**
 * Convert Uint8Array to base64 string
 */
export function bufferToBase64 (buffer: Uint8Array): string {
    let binary = ''
    const len = buffer.byteLength
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(buffer[i])
    }
    return btoa(binary)
}

/**
 * Convert base64 string to Uint8Array
 */
export function base64ToBuffer (base64: string): Uint8Array {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
    }
    return bytes
}
