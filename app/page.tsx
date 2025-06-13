"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, LogIn } from "lucide-react";
import { UserButton, useUser, SignInButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import DashboardPage from "./(dashboard)/dashboard/page";
import DashboardLayout from "./(dashboard)/layout";

export default function Home() {
  const { isLoaded, isSignedIn, user } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.push('/dashboard');
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded) {
    return <div>Loading...</div>;
  }

  return (
    <DashboardLayout>
      <DashboardPage />
    </DashboardLayout>
  )
}
