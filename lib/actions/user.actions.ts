'use server'

import { revalidatePath } from "next/cache";
import User from "../models/user.model";
import { connectToDB } from "../mongoose"
import Thread from "../models/thread.model";
import { FilterQuery, SortOrder } from "mongoose";
import Community from "../models/community.model";

interface UserType {
  userId: string,
  username: string,
  name: string,
  bio: string,
  image: string,
  path: string,
}

export const updateUser = async ({userId, username, name, bio, image, path}: UserType): Promise<void> => {
  try {
    connectToDB();
    await User.findOneAndUpdate(
      {id: userId},
      {
        username: username.toLowerCase(),
        name,
        bio,
        image,
        onboarded: true,
      },
      {upsert: true},
    );
    if(path === 'profile/edit') {
      revalidatePath(path);
    }
  } catch (error: any) {
    throw new Error(`Failed to create/update user: ${error.message}`);
  }
}

export const fetchUser = async (userId: string) => {
  try {
    connectToDB();
    return await User.findOne({ id: userId })
    .populate({
      path: 'communities',
      model: Community,
    })
  } catch (error: any) {
    throw Error(`Failed to fetch user: ${error.message}`);
  }
}

export const fetchUserPosts = async (userId: string) => {
  try {
    connectToDB();
    // Find all threads authored by user with the given userId
    // TODO: populate community
    const userStuff = await User.findOne({id: userId})
      .populate({
        path: 'threads',
        model: Thread,
        populate: [
          {
            path: 'community',
            model: Community,
            select: 'name id iamge _id',
          },
          {
            path: 'children',
            model: Thread,
            populate: {
              path: 'author',
              model: User,
              select: 'name image id'
            },
          },
        ],
      });
      return userStuff;

  } catch (error: any) {
    throw Error(`Failed to fetch user: ${error.message}`);
  }
}

// TODO: understand below db query!
export const fetchUsers = async ({
  userId,
  searchString = "",
  pageNumber = 1,
  pageSize = 30,
  sortBy = "desc"
}: {
  userId: string;
  searchString?: string;
  pageNumber?: number;
  pageSize?: number;
  sortBy?: SortOrder
}) => {
  try {
    connectToDB();
    const skipAmount = (pageNumber - 1) * pageSize;

    const regex = new RegExp(searchString, "i");

    const query: FilterQuery<typeof User> = {
      id: { $ne: userId}
    }

    if(searchString.trim() !== '') {
      query.$or = [
        {username: { $regex: regex}},
        {name: { $regex: regex}},
      ]
    }

    const sortOptions = { createdAt: sortBy };

    const userQuery = User.find(query)
      .sort(sortOptions)
      .skip(skipAmount)
      .limit(pageSize);

    const totalUserCount = await User.countDocuments(query);

    const users = await userQuery.exec();

    const isNext = totalUserCount > (skipAmount + users.length);

    return {users, isNext};

  } catch (error: any) {
    throw new Error(`Failed to fetch users: ${error.message}`);
  }
}

export const getActivities = async (userId: string) => {
  try {
    connectToDB();
    // find all threads created by the user
    const userThreads = await Thread.find({ author: userId });
    // collect all the child thread ids (replies) from the 'children' filed
    const childThreadIds = userThreads.reduce((acc, userThread) => {
      return acc.concat(userThread.children);
    }, [])

    const replies = await Thread.find({
      _id: { $in: childThreadIds },
      author: { $ne: userId }
    }).populate({
      path: 'author',
      model: User,
      select: 'name image _id'
    });
    return replies;

  } catch (error: any) {
    throw new Error(`Failed to fetch activity: ${error.message}`)
  }
}