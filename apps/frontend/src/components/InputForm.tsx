"use client";

import { useState } from "react";
import Image from "next/image";
import { BASE_API_URL } from "../config";

export default function InputForm() {
  const [inputPrompt, setInputPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);

  // Function to handle image generation
  const handleGenerate = async () => {
    if (!inputPrompt.trim()) return;

    setIsGenerating(true);
    setError("");
    setGeneratedImage(null);

    const startTime = Date.now();
    console.log(`🚀 Starting image generation for prompt: "${inputPrompt}"`);

    try {
      const response = await fetch(`${BASE_API_URL}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: inputPrompt,
          style: "anime", // Currently only supporting anime style
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate image");
      }

      const data = await response.json();
      const endTime = Date.now();
      console.log(
        `⏱️ Total generation time: ${(endTime - startTime) / 1000} seconds`
      );

      if (data.info) {
        try {
          // Try to parse the info JSON if it's a string
          const infoObj =
            typeof data.info === "string" ? JSON.parse(data.info) : data.info;
          console.log("📊 Generation details:", {
            model: infoObj.sd_model_name,
            seed: infoObj.seed || infoObj.all_seeds?.[0],
            steps: infoObj.steps,
            cfgScale: infoObj.cfg_scale,
            sampler: infoObj.sampler_name,
          });
        } catch (e) {
          console.log("Could not parse image info");
        }
      }

      // Use the saved image path if available, otherwise fall back to base64
      if (data.imagePath) {
        console.log(`🖼️ Displaying saved image from: ${data.imagePath}`);

        // Check if using custom folder path outside project
        if (data.useCustomFolder) {
          // For external files, we need to use base64 data instead of file paths
          // since Next.js Image component doesn't support local file access
          console.log(`Using custom folder: ${data.fullFilePath}`);
          if (data.images && data.images[0]) {
            setGeneratedImage(`data:image/png;base64,${data.images[0]}`);
          } else {
            throw new Error("No image data available for custom folder");
          }
        } else {
          // Standard Next.js public path
          setGeneratedImage(data.imagePath);
        }
      } else if (data.images && data.images[0]) {
        console.log(
          `🖼️ Displaying base64 image data (${Math.round(
            data.images[0].length / 1024
          )} KB)`
        );
        setGeneratedImage(`data:image/png;base64,${data.images[0]}`);
      } else {
        throw new Error("No image data received");
      }

      // Emit the event for parent components if needed
      const generatedImageEvent = new CustomEvent("imageGenerated", {
        detail: {
          image: data.imagePath || (data.images && data.images[0]) || null,
          isPath: !!data.imagePath,
        },
      });
      window.dispatchEvent(generatedImageEvent);
    } catch (err: any) {
      console.error("Failed to generate image:", err);
      setError(err.message || "Failed to generate image. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-5 rounded-xl border border-gray-700 bg-black">
      {/* Input prompt section */}
      <div className="mb-5">
        <div className="mb-2">
          <span className="text-white text-sm px-2">
            Enter prompt to generate image
          </span>
        </div>
        <div className="p-3 rounded-lg border border-gray-700 bg-black">
          <textarea
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            className="w-full bg-transparent outline-none resize-none text-white h-20 text-base"
          />
        </div>
      </div>

      {/* Generate button */}
      <button
        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg text-base font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={handleGenerate}
        disabled={isGenerating || !inputPrompt.trim()}
      >
        {isGenerating ? "Generating..." : "Generate"}
      </button>

      {/* Error message */}
      {error && <div className="mt-3 text-red-500 text-sm">{error}</div>}

      {/* Generated image display */}
      {generatedImage && (
        <div className="mt-5 flex justify-center">
          {generatedImage.startsWith("data:") ? (
            // Base64 image
            <img
              src={generatedImage}
              alt="Generated image"
              className="max-w-full max-h-[500px] object-contain rounded"
            />
          ) : (
            // Path-based image in Next.js public folder
            <Image
              src={generatedImage}
              alt="Generated image"
              width={512}
              height={768}
              className="max-w-full max-h-[500px] object-contain rounded"
            />
          )}
        </div>
      )}
    </div>
  );
}
