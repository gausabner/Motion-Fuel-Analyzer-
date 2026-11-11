import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import type { NextAuthOptions } from "next-auth";
import bcrypt from "bcryptjs";
import { loginAllowed, recordLoginFailure, recordLoginSuccess, clientIpFromHeaders } from "@/lib/rate-limit";

// A fixed bcrypt hash used to run a compare even when the user is missing, so
// response timing doesn't reveal which emails exist (user enumeration guard).
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8DvywQq0eG0Q4Zr5xg5m0aVbQ0m0m";

export const authOptions: NextAuthOptions = {
    secret: process.env.NEXTAUTH_SECRET,
    session: { strategy: "jwt" },
    providers: [
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "text", placeholder: "you@company.com" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials, req) {
                const email = credentials?.email?.trim().toLowerCase();
                const password = credentials?.password ?? "";
                if (!email || !password) return null;

                // Rate-limit by IP + email. When locked out, reject without even
                // checking the password (blunts brute-force / credential stuffing).
                const ip = clientIpFromHeaders((req as any)?.headers);
                const rlKey = `${ip}|${email}`;
                if (!loginAllowed(rlKey)) return null;

                const user = await prisma.user.findUnique({ where: { email } });

                // Always run a compare (real or dummy) to keep timing uniform.
                const hash = user?.password || DUMMY_HASH;
                const ok = await bcrypt.compare(password, hash);

                // Fail identically for: no user, no password set, wrong password,
                // or an account not yet ACTIVE — never reveal which one.
                if (!user || !user.password || !ok || user.status !== "ACTIVE") {
                    recordLoginFailure(rlKey);
                    return null;
                }

                recordLoginSuccess(rlKey);
                return {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                };
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.role = (user as any).role;
                token.id = (user as any).id;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                (session.user as any).role = token.role;
                (session.user as any).id = token.id;
            }
            return session;
        },
    },
    pages: {
        signIn: "/auth/signin",
    },
};
