"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Globe, KeyRound, Mail, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth/client";

export function LoginClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  function afterAuth() {
    toast.success("Signed in");
    router.push("/app");
    router.refresh();
  }

  function signInEmail() {
    startTransition(async () => {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        toast.error(result.error.message ?? "Sign in failed");
        return;
      }
      afterAuth();
    });
  }

  function signUpEmail() {
    startTransition(async () => {
      const result = await authClient.signUp.email({ email, password, name: name || email });
      if (result.error) {
        toast.error(result.error.message ?? "Sign up failed");
        return;
      }
      afterAuth();
    });
  }

  function signInGoogle() {
    startTransition(async () => {
      const result = await authClient.signIn.social({ provider: "google", callbackURL: "/app" });
      if (result.error) {
        toast.error(result.error.message ?? "Google sign in failed");
      }
    });
  }

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-3xl border bg-card p-8 shadow-sm lg:p-12">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">Tenant CMS</p>
          <h1 className="mt-8 text-balance text-5xl font-semibold tracking-[-0.055em] sm:text-7xl">
            Sign in to shape structured content.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
            Create a workspace, define composable models, publish entries, and manage assets from one tenant-scoped workbench.
          </p>
          <Button asChild variant="link" className="mt-8 px-0">
            <Link href="/">Back to overview</Link>
          </Button>
        </section>

        <Card className="border bg-card shadow-sm">
          <CardHeader>
            <CardTitle>Access workbench</CardTitle>
            <CardDescription>Use Google OAuth or the development email/password flow.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" variant="outline" onClick={signInGoogle} disabled={isPending}>
              <Globe data-icon="inline-start" />
              Continue with Google
            </Button>
            <div className="my-5 flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>

            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="mt-5">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="signin-email">Email</FieldLabel>
                    <Input id="signin-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="signin-password">Password</FieldLabel>
                    <Input id="signin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
                  </Field>
                  <Button onClick={signInEmail} disabled={isPending || !email || !password}>
                    <KeyRound data-icon="inline-start" />
                    Sign in
                  </Button>
                </FieldGroup>
              </TabsContent>
              <TabsContent value="signup" className="mt-5">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="signup-name">Name</FieldLabel>
                    <Input id="signup-name" value={name} onChange={(event) => setName(event.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="signup-email">Email</FieldLabel>
                    <Input id="signup-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="signup-password">Password</FieldLabel>
                    <Input id="signup-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
                  </Field>
                  <Button onClick={signUpEmail} disabled={isPending || !email || !password}>
                    <UserPlus data-icon="inline-start" />
                    Create dev account
                  </Button>
                </FieldGroup>
              </TabsContent>
            </Tabs>

            <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
              <Mail /> Email/password is intended for local development.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
