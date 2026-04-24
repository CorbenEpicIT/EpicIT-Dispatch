import jwt from "jsonwebtoken";
import { id } from "zod/v4/locales";
import { db } from "../db.js";
import { createErrorResponse, ErrorCodes } from "../types/responses.js";

// copied from prisma schema
interface User {
    id: string;
    name: string;
    organization_id: string | null;
    title: string;
    description: string;
    email: string;
    phone: string | null;
    password: string;
    last_login: Date | null;
}
const JWT_SECRET = process.env.JWT_ACCESS_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

export const hasValidRefreshToken = async (userId: string): Promise<string | null> => {
    const record = await db.jwt_refresh_token.findFirst({
        where: {
            userId: userId,
            expiresAt: { gt: new Date() },
        },
        select: { token: true },
    });
    return record?.token ?? null;
}

export const generateAccessToken = (user: User, role: string, orgTimezone?: string | null)=>{
        if (!JWT_SECRET) {
            throw new Error("JWT_ACCESS_SECRET is not defined in environment variables");
        }
        return jwt.sign(
            {
                uid: user.id,
                email: user.email,
                role: role,
                organization_id: user.organization_id,
                organization_timezone: orgTimezone ?? null,
            },
            JWT_SECRET,
            {expiresIn : '15m'}  // token expires in an hour may change in future
        );
}

export const gererateRefreshToken = async (user: User, role: string) => {
    if (!JWT_REFRESH_SECRET) {
        throw new Error("JWT_REFRESH_SECRET is not defined in environment variables");
    }

    // checks if user already has a valid refresh token and returns it 
    const oldToken = await hasValidRefreshToken(user.id);
    if (oldToken) {
        return oldToken;    
    }

    const token = jwt.sign(
        {id: user.id, email: user.email, role: role},
        JWT_REFRESH_SECRET,
        {expiresIn: '7d'} 
    );

    await db.jwt_refresh_token.create({
            data: {
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 day expiration
                role: role,
                token: token,
                userId: user.id
            }
        });
    return token;
}

export const generateOTPToken = (user: User, role: string) => {
    if (!JWT_SECRET) {
        throw new Error("JWT_ACCESS_SECRET is not defined in environment variables");
    }
    return jwt.sign(
        { userId: user.id, role, stage: 'pending_otp' },
        JWT_SECRET,
        { expiresIn: '10m' }
    );
}

export const verifyToken = (token: string) => {
    if (!JWT_SECRET) {
        throw new Error("JWT_ACCESS_SECRET is not defined in environment variables");
    }
    return jwt.verify(token, JWT_SECRET) as {
        uid: string;
        email: string;
        role: string;
        organization_id: string | null;
        organization_timezone: string | null;
    };
}

export const verifyRefreshToken = async (token: string) => {
    if (!JWT_REFRESH_SECRET){
        throw new Error("JWT_REFRESH_SECRET is not defined in environment variables");
    }

    const storedToken = await db.jwt_refresh_token.findFirst({
        where: {
            token: token,
            expiresAt: { gt: new Date() },   // must not be expired
        },
    });

    if (!storedToken) {
        return createErrorResponse(ErrorCodes.INVALID_TOKEN, "Refresh token not found or expired");
    }

    return jwt.verify(token, JWT_REFRESH_SECRET) as {
        id: string;
        email: string;
        role: string;
    };
}

export const verifyOTPToken = (token: string) => {
    if (!JWT_SECRET){
        throw new Error("JWT_ACCESS_SECRET is not defined in environment variables");
    }
    return jwt.verify(token, JWT_SECRET) as {
        userId: string;
        role: string;
        stage: 'pending_otp';
    };
}

export const refreshAccessToken = async (refreshToken: string) => {
    try {
        const user = await verifyRefreshToken(refreshToken);
        if ("error" in user) {
            return user; // pass through error response from verifyRefreshToken
        }
        if (!JWT_SECRET){
            throw new Error("JWT_ACCESS_SECRET is not defined in environment variables");
        }
        
        const dbUser = user.role === "technician"
            ? await db.technician.findUnique({ where: { id: user.id }, select: { organization_id: true } })
            : await db.dispatcher.findUnique({ where: { id: user.id }, select: { organization_id: true } });

        let orgTimezone: string | null = null;
        if (dbUser?.organization_id) {
            const org = await db.organization.findUnique({
                where: { id: dbUser.organization_id },
                select: { timezone: true },
            });
            orgTimezone = org?.timezone ?? null;
        }

        const jwtResult = jwt.sign(
                    {
                        uid: user.id,
                        email: user.email,
                        role: user.role,
                        organization_id: dbUser?.organization_id ?? null,
                        organization_timezone: orgTimezone,
                    },
                    JWT_SECRET,
                    {expiresIn : '15m'}
                );

        return jwtResult;  
    } catch (e) {
        if (e instanceof jwt.JsonWebTokenError) {
            throw createErrorResponse(ErrorCodes.INVALID_TOKEN, "Invalid refresh token");
        }
        throw e;
    }
}
