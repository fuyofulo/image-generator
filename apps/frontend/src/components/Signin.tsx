import { useState } from "react";
import { BASE_API_URL } from "../config";

interface SigninProps {
  onSuccess?: () => void;
  onSwitch?: () => void;
}

export function Signin({ onSuccess, onSwitch }: SigninProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`${BASE_API_URL}/user/signin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      setMessage(data.message);
      if (data.message === "user signed in successfully") {
        // Clear form on success
        setUsername("");
        setPassword("");
        onSuccess?.();
      }
    } catch (error) {
      setMessage("An error occurred during signin");
      console.error("Signin error:", error);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <form className="w-full max-w-sm space-y-6" onSubmit={handleSubmit}>
        <h2 className="text-2xl font-bold text-center mb-4">Sign In</h2>
        <input
          id="username"
          name="username"
          type="text"
          required
          className="block w-full px-3 py-2 border border-gray-300 rounded mb-2"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          id="password"
          name="password"
          type="password"
          required
          className="block w-full px-3 py-2 border border-gray-300 rounded mb-2"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {message && (
          <div
            className={`text-center text-sm ${message.includes("error") || message.includes("incorrect") || message.includes("exist") ? "text-red-600" : "text-green-600"}`}
          >
            {message}
          </div>
        )}
        <button
          type="submit"
          className="w-full py-2 px-4 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-700"
        >
          Sign in
        </button>
        <div className="text-center mt-2">
          Don't have an account?{" "}
          <button
            type="button"
            className="text-indigo-600 hover:underline"
            onClick={onSwitch}
          >
            Sign up
          </button>
        </div>
      </form>
    </div>
  );
}
