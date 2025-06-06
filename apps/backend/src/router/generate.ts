import { Router, Request, Response } from "express";
import axios from "axios";
import fs from "fs";
import path from "path";
import { IMAGE_STORAGE } from "../config/paths";
import dotenv from "dotenv";

dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const router: any = Router();
const typedRouter = router as any;

// Utility to save base64 image
async function saveBase64Image(
  base64Data: string,
  prompt: string
): Promise<{ filePath: string; publicUrl: string }> {
  try {
    let imagesDir: string;
    let publicPath: string;

    if (IMAGE_STORAGE.USE_CUSTOM_FOLDER) {
      imagesDir = IMAGE_STORAGE.CUSTOM_FOLDER_PATH;
      publicPath = `file://${imagesDir}`;
    } else {
      imagesDir = path.join(process.cwd(), "public", "generated-images");
      publicPath = IMAGE_STORAGE.PUBLIC_PATH;
    }

    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    const now = new Date();
    const timestamp = `${now.toISOString().replace(/[:.]/g, "-")}`;
    const safePrompt = prompt
      .substring(0, 20)
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase();
    const filename = `${timestamp}_${safePrompt}.png`;
    const filePath = path.join(imagesDir, filename);

    if (fs.existsSync(filePath)) {
      return {
        filePath,
        publicUrl: IMAGE_STORAGE.USE_CUSTOM_FOLDER
          ? filePath
          : `${publicPath}/${filename}`,
      };
    }

    const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, "");
    fs.writeFileSync(filePath, base64Image, { encoding: "base64" });

    return {
      filePath,
      publicUrl: IMAGE_STORAGE.USE_CUSTOM_FOLDER
        ? filePath
        : `${publicPath}/${filename}`,
    };
  } catch (error) {
    console.error("Error saving image:", error);
    throw new Error("Failed to save image");
  }
}

// Modify prompt using OpenRouter
const modifyPrompt = async (basePrompt: string, style: string) => {
  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "google/gemini-2.0-flash-001",
        messages: [
          { role: "system", content: ANIME_SYSTEM_PROMPT },
          { role: "user", content: basePrompt },
        ],
        max_tokens: 3000,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const content = (response.data as any)?.choices?.[0]?.message?.content;
    if (!content) throw new Error("No content in response");
    

    return { prompt: content, error: null };
  } catch (error: any) {
    console.error("Modify prompt error:", error);
    return {
      error: `Failed to modify prompt: ${error.message || "Unknown error"}`,
      prompt: null,
    };
  }
};

// Express POST handler
typedRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { prompt: basePrompt, style } = req.body;

    if (!basePrompt) {
      return res.status(400).json({ error: "Missing prompt parameter" });
    }

    const { prompt: modifiedPrompt, error } = await modifyPrompt(
      basePrompt,
      style
    );

    console.log(`${modifiedPrompt}`);

    if (error) return res.status(500).json({ error });

    if (style === "anime") {
      const baseModel = "divineanimemix_V2.safetensors [21e8ae2ff3]";
      const loras = [
        { name: "more_details", strength: 0.3 },
        { name: "晖映(BG+LGHT)", strength: 0.6 },
      ];
      const loraTags = loras
        .map((l) => `<lora:${l.name}:${l.strength}>`)
        .join(" ");
      const finalPrompt = `${modifiedPrompt} ${loraTags}`;
      const negativePrompt =
        "easyNegative, bad anatomy, blurry, low quality, extra limbs";

      const payload = {
        prompt: finalPrompt,
        negative_prompt: negativePrompt,
        steps: 30,
        sampler_index: "Euler a",
        width: 512,
        height: 512,
        cfg_scale: 10,
        seed: -1,
        clip_skip: 2,
        override_settings: {
          sd_model_checkpoint: baseModel,
        },
        enable_hr: true,
        hr_upscaler: "R-ESRGAN 4x+ Anime6B",
        hr_scale: 2,
        hr_second_pass_steps: 0,
        denoising_strength: 0.7,
        hr_resize_x: 0,
        hr_resize_y: 0,
      };

      const start = Date.now();
      const sdRes = await axios.post(
        "http://127.0.0.1:7860/sdapi/v1/txt2img",
        payload
      );
      const generationTime = (Date.now() - start) / 1000;

      const imageData = (sdRes.data as any).images[0];
      try {
        const imagePath = await saveBase64Image(imageData, basePrompt);
        return res.json({
          ...(IMAGE_STORAGE.USE_CUSTOM_FOLDER
            ? sdRes.data
            : {
                ...(sdRes.data as any),
                images: undefined,
              }),
          imagePath: imagePath.publicUrl || null,
          fullFilePath: imagePath.filePath,
          generationTime,
          useCustomFolder: IMAGE_STORAGE.USE_CUSTOM_FOLDER,
        });
      } catch (saveErr) {
        console.error("Save failed:", saveErr);
        return res.json({
          ...(sdRes.data as any),
          imagePath: null,
          error: "Failed to save image",
          generationTime,
        });
      }
    }

    return res.status(400).json({
      message: "Style not implemented",
      supportedStyles: ["anime"],
    });
  } catch (err) {
    console.error("POST /generate error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export const generateRouter = typedRouter;

const ANIME_SYSTEM_PROMPT = `You are an expert image prompt engineer for text-to-image diffusion models. Your job is to take a user-provided base prompt along with a style descriptor and transform it into a detailed, high-quality prompt that includes all the essential elements listed below.

Please analyze the user's input and compare it to the following checklist. If any critical element is missing from the base prompt, add appropriate details so that the final prompt is rich in description and optimized for generating a visually stunning image.

Checklist of Required Elements:

Subject & Character Details:

Clearly identify the subject (e.g., "1girl", "solo", or "1boy")

Include details about age, facial features (e.g., large expressive eyes, detailed facial expressions), and hairstyle (length, color, style)

Clothing & Accessories:

Specify the type of clothing or uniform (e.g., school uniform, red dress, formal attire)

Mention any notable accessories (e.g., ribbons, jewelry, headband)

Action & Pose:

Describe the pose, movement, or expression (e.g., "looking up", "from side", "running", "upper body", "portrait")

Environment & Setting:

Indicate whether the scene is indoors or outdoors

Provide context about the location or backdrop (e.g., "library", "city", "garden", "urban backdrop")

Include atmospheric details such as lighting (e.g., "candlelight", "sunlight", "neon", "soft lighting") and time of day (e.g., "day", "night")

Artistic Style & Medium:

Specify the intended artistic style (e.g., "anime-style", "hyper-realistic", "pencil drawing", "sketch", "monochrome")

Use descriptive quality terms like "ultra-detailed", "highres", "cinematic", or "dynamic perspective"

Modifiers & Effects:

Include any additional modifiers or visual effects (e.g., "blurry", "depth of field", "letterboxed")

If applicable, include model-specific tags like a LoRA reference (e.g., <lora:Tsurime:1>)

Examples of Well-Crafted Prompts:

"1girl, solo, flower, long hair, outdoors, letterboxed, school uniform, day, sky, looking up, short sleeves, parted lips, shirt, cloud, black hair, sunlight, white shirt, serafuku, upper body, from side, white flower, blurry, brown hair, blue sky, depth of field"

"1girl, solo, blonde hair, long hair, high ponytail, hair intakes, red eyes, long eyelashes, thick eyelashes, looking at viewer, red dress, juliet sleeves, long sleeves, collarbone, indoors, library, books, dark, night, candlelight"

"1girl, solo, brown hair, short hair, hair between eyes, bangs, orange eyes, long eyelashes, thick eyelashes, looking at viewer, smile, :D, black shirt, black skirt, pleated skirt, medium breasts, outdoors, city, upper teeth"

"1girl, solo, upper body, mature, mature female, milf, amber, amberdef, brown hair, long hair, hair ribbon, yellow eyes, long eyelashes, thick eyelashes, looking at viewer, :3, white background"

"smile, kusanagi_naoya, red_ribbon, formal, pink_hair, misakura_rin, 1girl, school_uniform, multiple_boys, red_hair, suit, sakura_no_uta, ribbon, natsume_kei_(sakura_no_uta), white_hair, picture_frame, eina_(ao0708), 2boys, shirt, back, highres"

"(tsurime:1.2), tsurime, 1girl, solo, breasts, gyaru, downblouse, long hair, blush, looking at viewer, dark-skinned female, wavy hair, dark skin, monochrome, hands on own knees, cleavage, simple background, leaning forward, bent over, gradient hair, greyscale, collarbone, long sleeves, small breasts, medium breasts, smile, white blouse, white hair, lora:Tsurime:1"

"sketch, monochrome, traditional media, pencil drawing, 1girl, strapless dress, running in the garden, floral background"

Task: Given the user's base prompt and style descriptor, first analyze the input to determine which elements from the checklist are missing. Then, generate a refined prompt that fills in those gaps while maintaining the original concept. Ensure that the final prompt is detailed, visually rich, and optimized for generating a high-quality image.

For example, if the user provides:

Base Prompt: "a boy wearing a blue jacket and a red hat"

Style Descriptor: "anime"

Your output might be:

"1boy, blue jacket, red hat, anime, expressive eyes, dynamic lighting, detailed line art, urban backdrop."

Now, please generate an optimized prompt for the given user input. You dont need to add any other text than the prompt as it will be used as a prompt for a text-to-image model and anything else will be ignored. Do not add any lora tags yourself please.`;
