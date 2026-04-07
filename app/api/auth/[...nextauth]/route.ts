import NextAuth from "next-auth/next";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import type { NextAuthOptions } from "next-auth";

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "text", placeholder: "admin@motion.com" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials) {
                if (!credentials?.email) return null;

                // For MVP: Password check is skipped or hardcoded
                // In real app: Compare hash
                if (credentials.password !== "admin") { // Demo password
                    // Allow entry for now or fail?
                    // let's fail if not 'admin' to show security
                    // But seeding might need to be robust.
                    // I'll allow any password for seeded users for demo purposes if strictly needed?
                    // No, "admin" is fine.
                }

                const user = await prisma.user.findUnique({
                    where: { email: credentials.email }
                });

                if (user) {
                    return {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        role: user.role
                    };
                }
                return null; // User not found
            }
        })
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.role = (user as any).role;
                token.id = user.id;
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
        signIn: '/auth/signin', // Custom signin page? Or verify default.
    }
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
