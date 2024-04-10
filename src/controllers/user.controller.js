import {asyncHandler} from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import {User} from '../models/user.model.js';
import {uploadOnCloudinary} from '../utils/cloudinary.js';
// import { response } from 'express';
import jwt from "jsonwebtoken"
import { use } from 'bcrypt/promises.js';
// import mongoose from "mongoose";

const generateAccessAndRefreshTokens = async(userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken =user.generateRefreshToken() 
        user.refreshToken = refreshToken
        await user.save({validateBeforeSave:false})
        return {accessToken, refreshToken}
    } catch (error) {
        throw new ApiError(500, "something went wrong while generating refresh tokens and access tokens");
        
    }
}

const registerUser = asyncHandler(async (req,res)=>{
    //  res.status(200).json({
    //     message:"ok",
    // })

    //Get user details from frontend
    //vaiidation -not empty
    //check is the user already exist :username and email
    //check for images, check for avatar
    // upload them to cloudinar server, avatar 
    // create user Object - create entry in db
    //remove password and refresh token feild from response
    //check for usr creation
    //return response 

    const {fullName, email, username, password} =req.body;
    console.log("email", email, username, password, fullName);

    if (
        [fullName, email, username, password].some((field) => field?.trim() === "")
        
    ) {
        throw new ApiError(400, "All fields are required")
    }

    const existedUser = await User.findOne({
        //to use operater type $
        $or: [{username}, {email}]
    })

    if(existedUser) throw new ApiError(409, "User with email or username already exists")
    console.log(req.files);

    const avatarLocalPath = req.files?.avatar[0]?.path;
    // console.log(req.files.avatar[0].path);
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;
    let coverImageLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path
    }

    if (!avatarLocalPath) throw new ApiError(400, "Avatar file is reqired");
    
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage =await uploadOnCloudinary(coverImageLocalPath)
    // console.log(avatar);
    if (!avatar) {throw new ApiError(400, "Avatar file is reqired")};

    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase(),
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if (!user) throw new ApiError(500, "something went wrong while registering user"); 

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successfully")
    )
})

const loginUser = asyncHandler(async (req, res) => {
    const { email, username, password } = req.body;
    console.log(req.body);
    if (!username && !email) {
        throw new ApiError(400, "username or email is required");
    }

    const user = await User.findOne({ 
        $or: [{username}, {email}]
    })

    if (!user) throw new ApiError(404, "user does not exist");

    const isPasswordValid =  await user.isPasswordCorrect(password)

    if(!isPasswordValid) throw new ApiError(401,"password is incorrect");

    const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id)

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure: true
    }
    
    return res
    .status(200)
    .cookie("accessToken",accessToken,options)
    .cookie("refreshToken",refreshToken,options)
    .json(
        new ApiResponse(
            200,
            {
                user: loggedInUser, accessToken, refreshToken
            },
            "User logged in successfully"
        )
    )

})

const logoutUser = asyncHandler(async(req,res)=>{
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set:{
                refreshToken:undefined,
            }
        },
        {
            new: true
        }

    )

    const options = {
        httpOnly: true,
        secure: true,
    }

    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(
        new ApiResponse(200,{}, "user logged out")
    )
})

const refreshAccessToken = asyncHandler(async(req,res)=>{
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if(!incomingRefreshToken) throw new ApiError(401,"unauthorized request")
    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
    
        const user = await User.findById(decodedToken?._id)
        if(!user) throw new ApiError(401,"invalid refresh token")
    
        if(incomingRefreshToken !== user?.refreshToken) throw new ApiError(401, "refresh token is expired or used")
    
        const options = {
            httpOnly: true,
            secure:true
        }
    
        const {accessToken, newRefreshToken} = await generateAccessAndRefreshTokens(user._id)
    
        return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newRefreshToken, options)
        .json(
            new ApiResponse(
                200,
                {accessToken, refreshToken:newRefreshToken},
                "access token refreshed successfully"
            )
        )
    } catch (error) {
        throw new ApiError(401,error?.message || "Invalid refresh token")
        
    }

});

const changeCurrentPassword = asyncHandler(async(req, res) => {
    const {oldPassword, newPassword} = req.body

    

    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if (!isPasswordCorrect) {
        throw new ApiError(400, "Invalid old password")
    }

    user.password = newPassword
    await user.save({validateBeforeSave: false})

    return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"))
})

const getCurrentUser = asyncHandler(async(req, res) => {
    return res
    .status(200)
    .json(new ApiResponse(
        200,
        req.user,
        "User fetched successfully"
    ))
})

const updateAccountDetails = asyncHandler(async(req, res) => {
    const {fullName, email} = req.body

    if (!fullName || !email) {
        throw new ApiError(400, "All fields are required")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName,
                email: email
            }
        },
        {new: true}
        
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"))
});

const updateUserAvatar = asyncHandler(async(req, res) => {
    const avatarLocalPath = req.files?.path
    if(!avatarLocalPath) throw new ApiError(400, "Avatar file is missign")

    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if (!avatar.url) throw new ApiError(400,"Error while uploading an avatar")

    const user = await User.findOneAndUpdate(
        req.user?._id,
        {
            $set:{
                avatar : avatar.url
            }
        },
        {
            new: true
        }
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(200,user,"avatar updated successfully")
    )
});


const updateUserCoverImage = asyncHandler(async(req, res) => {
    const coverImageLocalPath = req.files?.path
    if(!coverImageLocalPath) throw new ApiError(400, "coverImage file is missign")

    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if (!coverImage.url) throw new ApiError(400,"Error while uploading an coverImage")

    const user = await User.findOneAndUpdate(
        req.user?._id,
        {
            $set:{
                coverImage : coverImage.url
            }
        },
        {
            new: true
        }
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(200,user,"coverImage updated successfully")
    )
});



export {registerUser,loginUser,
    logoutUser,getCurrentUser,
     updateAccountDetails, 
     refreshAccessToken,
     changeCurrentPassword,
     updateUserAvatar, 
     updateUserCoverImage }
