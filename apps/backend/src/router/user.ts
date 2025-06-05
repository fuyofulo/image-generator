import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prismaClient } from "@repo/db/client";


const router: any = Router();
const typedRouter = router as any;

typedRouter.post("/signup", async (req: Request, res: Response) => {

    const data = req.body;
    const username = data.username;
    const password = data.password;

    const existingUser = await prismaClient.user.findFirst({
        where: {
          username: username,
        },
    });

    if (existingUser) {
        res.json({
          message: "user already exists",
        });
        return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prismaClient.user.create({
        data: {
            username: username ,
            password: hashedPassword,
            images: 0,
        }
    })

    if (!user) {
        res.json({
          message: "internal error creating user",
        });
    }



    res.json({
        message: "user created successfully",
        user: user,
    });


});


typedRouter.post("/signin", async (req: Request, res: Response) => {

    const data = req.body;
    const username = data.username;
    const password = data.password;

    const user = await prismaClient.user.findFirst({
        where: {
          username: username,
        },
    });

    if (!user) {
        return res.json({
          message: "user does not exist",
        });
    }

    const passwordMatch = await bcrypt.compare(
        password,
        user.password
    );
    
    if (!passwordMatch) {
        return res.json({
          message: "incorrect password",
        });
    }

    res.json({
        message: "user signed in successfully",
    });

});

export const userRouter = typedRouter;