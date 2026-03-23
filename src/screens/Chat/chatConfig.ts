/**
 * Nuble Chat & Platform configuration.
 *
 * NUBLE_CHAT_URL — the base URL of your ROKET-CHAT backend.
 * NUBLE_PLATFORM_URL — the base URL of the ROKET-PLATFORM (Vibe-Trading) backend.
 *
 * In development, these point to your local machine.
 * The React Native iOS simulator can reach your Mac's localhost
 * directly, but a physical device needs your Mac's LAN IP.
 *
 * In production, these should point to your deployed servers
 * (e.g. https://chat.nuble.app, https://api.nuble.app).
 */

// For iOS Simulator: localhost works directly
// For physical device: replace with your Mac's LAN IP (e.g. http://192.168.1.X:PORT)
// For production: replace with your deployed URL
export const NUBLE_CHAT_URL = 'http://localhost:4000';
export const NUBLE_PLATFORM_URL = 'http://localhost:5001';
