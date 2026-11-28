"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api";

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 2_000,
        // 4xx answers will not change on retry; network blips might.
        retry: (count, error) =>
          !(error instanceof ApiError && error.status < 500) && count < 2,
      },
    },
  });
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(makeClient);
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={client}>
        <TooltipProvider delayDuration={300}>
          {children}
          <Toaster position="bottom-right" closeButton />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
