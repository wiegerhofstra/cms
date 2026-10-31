"use client";

import { useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ConsumerType } from "@/lib/cms/types";
import { revalidateTenantAction } from "@/modules/revalidation/actions";

export function RevalidateButton({ tenantId, tenantName, consumerType }: { tenantId: string; tenantName: string; consumerType: ConsumerType }) {
  const astro = consumerType === "astro";
  const label = astro ? "Rebuild" : "Revalidate";
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function revalidate() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await revalidateTenantAction(tenantId, consumerType);
        if (!result.ok) throw new Error(result.error);
        setOpen(false);
        toast.success(astro ? `Coolify build queued for ${tenantName}. Check Coolify for completion.` : `Revalidation completed for ${tenantName}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Website update failed. Please try again.";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(value) => { if (!pending) { setOpen(value); setError(null); } }}>
      <AlertDialogTrigger asChild><Button variant="outline" disabled={pending} aria-label={`${label} website`}><RefreshCw /> <span className="max-sm:sr-only">{label}</span></Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label} {tenantName}?</AlertDialogTitle>
          <AlertDialogDescription>{astro ? `This queues a fresh static build for ${tenantName} on Coolify. The live website changes only after deployment succeeds. Check Coolify’s deployment logs for progress.` : `This will refresh the website’s cached content using the saved revalidation endpoint for ${tenantName}.`}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={(event) => { event.preventDefault(); revalidate(); }}>
            {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {pending ? (astro ? "Queuing build…" : "Revalidating…") : label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
