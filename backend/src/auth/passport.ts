import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { config } from "../config";
import { prisma } from "../lib/prisma";
import { ensureSenders } from "../services/senders.service";

passport.use(
  new GoogleStrategy(
    {
      clientID: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
      callbackURL: `${config.BACKEND_URL}/auth/google/callback`,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) return done(new Error("Google account has no email"));

        const user = await prisma.user.upsert({
          where: { googleId: profile.id },
          update: { name: profile.displayName, avatar: profile.photos?.[0]?.value, email },
          create: {
            googleId: profile.id,
            email,
            name: profile.displayName,
            avatar: profile.photos?.[0]?.value,
          },
        });
        await ensureSenders(user.id); // every user gets their Ethereal senders on first login
        done(null, user);
      } catch (err) {
        done(err as Error);
      }
    }
  )
);

export default passport;