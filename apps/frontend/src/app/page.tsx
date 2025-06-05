"use client";

import { useState } from "react";
import "./globals.css";
import InputForm from "@/components/InputForm";
import { Signup } from "@/components/Signup";
import { Signin } from "@/components/Signin";

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showSignup, setShowSignup] = useState(true);

  const handleSignupSuccess = () => {
    setIsLoggedIn(true);
  };

  const handleSigninSuccess = () => {
    setIsLoggedIn(true);
  };

  if (isLoggedIn) {
    return (
      <main className="container mx-auto py-6 px-4">
        <h1 className="text-xl font-bold mb-6 text-center">
          AI Image Generator
        </h1>
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="w-full">
            <InputForm />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main>
      {showSignup ? (
        <Signup
          onSuccess={handleSignupSuccess}
          onSwitch={() => setShowSignup(false)}
        />
      ) : (
        <Signin
          onSuccess={handleSigninSuccess}
          onSwitch={() => setShowSignup(true)}
        />
      )}
    </main>
  );
}
