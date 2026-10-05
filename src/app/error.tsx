"use client";
import { DatabaseZap } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="panel mx-auto max-w-xl p-10 text-center">
      <DatabaseZap className="mx-auto mb-5 size-8 text-neutral-signal" />
      <h1 className="text-xl font-medium">Research workspace unavailable</h1>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        Check that PostgreSQL is running, DATABASE_URL is configured, and Prisma migrations have
        been applied. Your saved analyses remain in the database.
      </p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
