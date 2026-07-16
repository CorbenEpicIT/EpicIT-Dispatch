import { db } from "../db.js"
import * as client from "openid-client"
import crypto from "crypto";

const BACKEND_URL = "http://localhost:3000"

export type Provider = "google" | "microsoft";
const PROVIDERS: Record<Provider, { issuer: string; clientId: string; clientSecret: string }> = {
      google: {
              issuer: "https://accounts.google.com",
              clientId: process.env.GOOGLE_CLIENT_ID ?? "",
              clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      },
      microsoft: {
              issuer: "https://login.microsoftonline.com/organizations/v2.0",
              clientId: process.env.MICROSOFT_CLIENT_ID ?? "",
              clientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
      },
};

function getProvider(provider: Provider) {
    const config = PROVIDERS[provider];
    if (!config.clientId || !config.clientSecret){
        throw new Error(`SSO provider "${provider}" is not configured`);
    }
    return config;
}

export function getAvailableProviders(): Provider[] {
    return (Object.keys(PROVIDERS) as Provider[]).filter(
        (p) => !!PROVIDERS[p].clientId && !!PROVIDERS[p].clientSecret
    );
}

export async function buildAuthorizationUrl(provider: Provider) {
    const config = getProvider(provider);
    const oidc = await client.discovery(
        new URL(config.issuer as string),
        config.clientId,
        config.clientSecret
    );

    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    const state = client.randomState();
    const nonce = client.randomNonce();
    const url = client.buildAuthorizationUrl(oidc, {
        redirect_uri: BACKEND_URL + "/auth/sso/callback",
        scope: "openid email profile",
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
    });
    return { url: url.href, state, nonce, codeVerifier };
}

export async function handleCallback(
    provider: Provider,
    currentUrl: URL,
    expected: {state: string, nonce: string, codeVerifier: string}
){
    const config = getProvider(provider);
    const oidc = await client.discovery(new URL(config.issuer), config.clientId, config.clientSecret);
    const tokens = await client.authorizationCodeGrant(oidc, currentUrl, {
        expectedState: expected.state,
        expectedNonce: expected.nonce,
        pkceCodeVerifier: expected.codeVerifier
    });
    const claims = tokens.claims();
    if (!claims){
        throw new Error ("Error handling callback");
    }
    if (claims.email_verified !== true || claims.email === undefined) throw new Error ("Error handling callback");
    return { email: (claims.email as string | undefined)?.toLowerCase(), sub: claims.sub }
}

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex"); 

export async function mintHandoffCode(userId: string, role: string){
    const code = crypto.randomBytes(32).toString("base64url");
    await db.sso_handoff.create({
        data: {
            code_hash: sha256(code), 
            user_id: userId,
            role,
            expires_at: new Date(Date.now() + 60_000), 
        }
    });
    return code;
}

export async function consumeHandoffCode(code:string) {
    const row = await db.sso_handoff.findFirst({
        where: {
            code_hash: sha256(code),
        }
    });
    if (!row) return null;
    await db.sso_handoff.delete({
        where: { id: row.id }
    });
    if (row.expires_at < new Date()) return null;
    return { userId: row.user_id, role: row.role};
}