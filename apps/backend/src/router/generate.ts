import { Router, Request, Response } from "express";
import axios from "axios";
import fs from "fs";
import path from "path";
import { IMAGE_STORAGE } from "../config/paths";
import dotenv from "dotenv";

dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const router = Router();

// Style configurations
interface StyleConfig {
  baseModel: string;
  loras: Array<{ name: string; strength: number }>;
  negativePrompt: string;
  steps: number;
  samplerIndex: string;
  width: number;
  height: number;
  cfgScale: number;
  clipSkip: number;
  enableHr: boolean;
  hrUpscaler: string;
  hrScale: number;
  hrSecondPassSteps: number;
  denoisingStrength: number;
}

const STYLE_CONFIGS: Record<string, StyleConfig> = {
  "2d-anime": {
    baseModel: "divineanimemix_V2.safetensors [21e8ae2ff3]",
    loras: [
      { name: "more_details", strength: 0.3 },
      { name: "晖映(BG+LGHT)", strength: 0.6 },
    ],
    negativePrompt:
      "easyNegative, bad anatomy, blurry, low quality, extra limbs",
    steps: 30,
    samplerIndex: "Euler a",
    width: 512,
    height: 512,
    cfgScale: 10,
    clipSkip: 2,
    enableHr: true,
    hrUpscaler: "R-ESRGAN 4x+ Anime6B",
    hrScale: 2,
    hrSecondPassSteps: 0,
    denoisingStrength: 0.7,
  },
  "3d-anime": {
    baseModel: "3dAnimationDiffusion_v10.safetensors [31829c378d]",
    loras: [
      { name: "more_details", strength: 0.3 },
      { name: "晖映(BG+LGHT)", strength: 0.6 },
    ],
    negativePrompt:
      "easyNegative, bad anatomy, blurry, low quality, extra limbs, flat colors",
    steps: 30,
    samplerIndex: "Euler a",
    width: 512,
    height: 512,
    cfgScale: 10,
    clipSkip: 2,
    enableHr: true,
    hrUpscaler: "R-ESRGAN 4x+ Anime6B",
    hrScale: 2,
    hrSecondPassSteps: 0,
    denoisingStrength: 0.7,
  },
};

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

// Get appropriate system prompt based on style
const getSystemPrompt = (style: string): string => {
  switch (style) {
    case "2d-anime":
      return _2D_ANIME_SYSTEM_PROMPT;
    case "3d-anime":
      return _3D_ANIME_SYSTEM_PROMPT;
    default:
      return _2D_ANIME_SYSTEM_PROMPT; // fallback to 2D
  }
};

// Modify prompt using OpenRouter
const modifyPrompt = async (basePrompt: string, style: string) => {
  try {
    const systemPrompt = getSystemPrompt(style);

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "google/gemini-2.0-flash-001",
        messages: [
          { role: "system", content: systemPrompt },
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

// Generate image with style configuration
const generateImageWithStyle = async (
  modifiedPrompt: string,
  style: string
) => {
  const styleConfig = STYLE_CONFIGS[style];
  if (!styleConfig) {
    throw new Error(`Unsupported style: ${style}`);
  }

  const loraTags = styleConfig.loras
    .map((l) => `<lora:${l.name}:${l.strength}>`)
    .join(" ");
  const finalPrompt = `${modifiedPrompt} ${loraTags}`;

  console.log(finalPrompt);

  const payload = {
    prompt: finalPrompt,
    negative_prompt: styleConfig.negativePrompt,
    steps: styleConfig.steps,
    sampler_index: styleConfig.samplerIndex,
    width: styleConfig.width,
    height: styleConfig.height,
    cfg_scale: styleConfig.cfgScale,
    seed: -1,
    clip_skip: styleConfig.clipSkip,
    override_settings: {
      sd_model_checkpoint: styleConfig.baseModel,
    },
    enable_hr: styleConfig.enableHr,
    hr_upscaler: styleConfig.hrUpscaler,
    hr_scale: styleConfig.hrScale,
    hr_second_pass_steps: styleConfig.hrSecondPassSteps,
    denoising_strength: styleConfig.denoisingStrength,
    hr_resize_x: 0,
    hr_resize_y: 0,
  };

  return await axios.post("http://127.0.0.1:7860/sdapi/v1/txt2img", payload);
};

// Get available styles
router.get("/styles", (req: Request, res: Response) => {
  const availableStyles = Object.keys(STYLE_CONFIGS).map((key) => ({
    id: key,
    name: key.replace("-", " ").replace(/\b\w/g, (l) => l.toUpperCase()),
    description: `${key.includes("3d") ? "3D" : "2D"} anime style generation`,
  }));

  res.json({ styles: availableStyles });
});

// Express POST handler
router.post("/", async (req: Request, res: Response): Promise<any> => {
  try {
    const { prompt: basePrompt, style } = req.body;

    if (!basePrompt) {
      return res.status(400).json({ error: "Missing prompt parameter" });
    }

    if (!style) {
      return res.status(400).json({ error: "Missing style parameter" });
    }

    if (!STYLE_CONFIGS[style]) {
      return res.status(400).json({
        error: `Unsupported style: ${style}`,
        supportedStyles: Object.keys(STYLE_CONFIGS),
      });
    }

    const { prompt: modifiedPrompt, error } = await modifyPrompt(
      basePrompt,
      style
    );
    if (error) return res.status(500).json({ error });

    const start = Date.now();
    const sdRes = await generateImageWithStyle(modifiedPrompt, style);
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
        style: style,
      });
    } catch (saveErr) {
      console.error("Save failed:", saveErr);
      return res.json({
        ...(sdRes.data as any),
        imagePath: null,
        error: "Failed to save image",
        generationTime,
        style: style,
      });
    }
  } catch (err) {
    console.error("POST /generate error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export const generateRouter = router;

const _2D_ANIME_SYSTEM_PROMPT = `You are an expert image prompt engineer for text-to-image diffusion models. Your job is to take a user-provided base prompt along with a style descriptor and transform it into a detailed, high-quality prompt that includes all the essential elements listed below.

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

Now, please generate an optimized prompt for the given user input. You dont need to add any other text than the prompt as it will be used as a prompt for a text-to-image model and anything else will be ignored.`;

const _3D_ANIME_SYSTEM_PROMPT = `You are a professional image prompt engineer specializing in 3D anime-style text-to-image diffusion models. Your job is to enhance a user-provided base prompt and optional style descriptor into a richly detailed, photorealistic, and cinematic-quality prompt ideal for 3D anime renders.

Please analyze the user's input and cross-reference it with the checklist below. If any key elements are missing or vague, intelligently enhance the prompt to create a visually compelling and high-quality final prompt that aligns with the 3D anime style.

Checklist of Required Elements:

Subject & Identity:
- Clearly specify subject type (e.g., "1girl", "cyborg", "cat samurai", "portrait of beautiful woman")
- Include physical features such as facial details (e.g., "sharp focus", "beautiful eyes", "elegant face", "cute face", "freckles")
- Add hair length, color, and style if not given (e.g., "short hair", "brown hair", "wavy")

Clothing & Armor:
- Identify clothing or armor (e.g., "medieval armor", "black cape", "cyber outfit"). If not specified, generate a random one that compliments the rest of the prompt.
- Emphasize materials and effects (e.g., "metal reflections", "textured fabric", "realistic sheen")

Expression, Pose & Composition:
- Include expression or pose (e.g., "looking at viewer", "off-shoulder", "upper body", "bare shoulders"). If not specified, generate a random one that compliments the rest of the prompt.
- Frame type (e.g., "portrait", "bust", "cinematic composition")

Environment & Lighting:
- Describe setting and time (e.g., "outdoors", "temple background", "castle in the distance", "night city"). If not specified, generate a random one that compliments the rest of the prompt.
- Use advanced lighting descriptors (e.g., "sidelighting", "cinematic lighting", "HDR", "soft natural light", "sunlight")

Visual Effects & Rendering Quality:
- Mention enhancements like "bokeh", "broken glass", "gold filigree", "depth of field". If not specified, generate a random one that compliments the rest of the prompt.
- Add resolution, quality, and realism (e.g., "8k", "ultra detailed", "highly realistic", "top quality", "award-winning")

Style Tags:
- Emphasize 3D anime realism (e.g., "official art", "realistic", "masterpiece", "3D render"). If not specified, generate a random one that compliments the rest of the prompt.

Examples of Well-Crafted Prompts:

"portrait of a girl, the most beautiful in the world, (medieval armor), metal reflections, upper body, outdoors, short hair, brown hair, sunlight, far away castle, professional photograph of a stunning woman, detailed, sharp focus, award winning, cinematic lighting"

"an ancient anthropomorphic cat samurai using an ancient samurai armor, photography, beautiful, bokeh temple background, colorful, masterpieces, top quality, best quality, official art, beautiful and aesthetic, realistic"

"8k portrait of beautiful cyborg with brown hair, intricate, elegant, highly detailed, majestic, digital photography, art by artgerm and ruan jia and greg rutkowski, surreal painting, gold butterfly filigree, broken glass, (masterpiece, sidelighting, finely detailed beautiful eyes:1.2), hdr"

"megumin, 1girl, bare shoulders, black cape, black gloves, black hair, blush, cape, choker, collarbone, dress, hair between eyes, hat, long sleeves, looking at viewer, medium hair, off-shoulder, ultra high quality, 3D anime, dramatic lighting"

Task: Given a base prompt and optional style descriptor, first analyze what's missing or unclear based on the checklist above. Then output a final, highly refined 3D anime prompt that is visually dense, realistic, and optimized for high-end image generation.

Important: Only return the enhanced prompt. Do not add any extra explanation, commentary, or formatting around the result. This output will be used directly in a text-to-image generation model.`;
