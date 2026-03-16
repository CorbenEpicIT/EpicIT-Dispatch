import jwt from "jsonwebtoken";

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
    last_login: Date;
}
const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? "demo-secret-key";

export const generateAccessToken = (user: User, role: string)=>{
        if (!JWT_SECRET) {
            throw new Error("JWT_ACCESS_SECRET is not defined in environment variables");
        }
        return jwt.sign(
        {
            uid: user.id,
            email: user.email,
            role: role
        },
        JWT_SECRET, 
        {expiresIn : '60m'}  // token expires in an hour may change in future 
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
    };
}
