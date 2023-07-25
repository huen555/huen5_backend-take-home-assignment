import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { db, type Database } from '@/server/db'
import { FriendshipStatusSchema } from '@/utils/server/friendship-schemas'
import { protectedProcedure } from '@/server/trpc/procedures'
import { router } from '@/server/trpc/router'
import {
  NonEmptyStringSchema,
  CountSchema,
  IdSchema,
} from '@/utils/server/base-schemas'

export const myFriendRouter = router({
  getById: protectedProcedure
    .input(
      z.object({
        friendUserId: IdSchema,
      })
    )

    .mutation(async ({ ctx, input }) => {
      // Create a query to get the number of mutual friends
      const mutualFriendCount = (db: Database) => {
        return db
          .selectFrom('friendships')
          .innerJoin(
            ctx.db
              .selectFrom('friendships')
              .select(['userId', 'friendUserId'])
              .where('userId', '=', input.friendUserId)
              .where('status', '=', FriendshipStatusSchema.Values['accepted'])
              .as('acceptedFriendships'),
            'friendships.friendUserId',
            'acceptedFriendships.friendUserId'
          )
          .select((eb) => [
            'acceptedFriendships.userId',
            eb.fn.count('friendships.friendUserId').as('mutualFriendCount'),
          ])
          .where('friendships.userId', '=', ctx.session.userId)
          .where(
            'friendships.status',
            '=',
            FriendshipStatusSchema.Values['accepted']
          )
          .groupBy('acceptedFriendships.userId')
      }
      return ctx.db.connection().execute(async (conn) =>
        /**
         * Question 4: Implement mutual friend count
         *
         * Add `mutualFriendCount` to the returned result of this query. You can
         * either:
         *  (1) Make a separate query to count the number of mutual friends,
         *  then combine the result with the result of this query
         *  (2) BONUS: Use a subquery (hint: take a look at how
         *  `totalFriendCount` is implemented)
         *
         * Instructions:
         *  - Go to src/server/tests/friendship-request.test.ts, enable the test
         * scenario for Question 3
         *  - Run `yarn test` to verify your answer
         *
         * Documentation references:
         *  - https://kysely-org.github.io/kysely/classes/SelectQueryBuilder.html#innerJoin
         */

        conn
          .selectFrom('users as friends')
          .innerJoin('friendships', 'friendships.friendUserId', 'friends.id')
          .innerJoin(
            userTotalFriendCount(conn).as('userTotalFriendCount'),
            'userTotalFriendCount.userId',
            'friends.id'
          )

          // Connect to query data
          .leftJoin(
            mutualFriendCount(conn).as('mutualFriendCountData'),
            'mutualFriendCountData.userId',
            'friends.id'
          )
          .where('friendships.userId', '=', ctx.session.userId)
          .where('friendships.friendUserId', '=', input.friendUserId)
          .where(
            'friendships.status',
            '=',
            FriendshipStatusSchema.Values['accepted']
          )
          .select([
            'friends.id',
            'friends.fullName',
            'friends.phoneNumber',
            'totalFriendCount',

            // Targeted results
            'mutualFriendCount',
          ])
          .executeTakeFirstOrThrow(() => new TRPCError({ code: 'NOT_FOUND' }))
          .then(
            z.object({
              id: IdSchema,
              fullName: NonEmptyStringSchema,
              phoneNumber: NonEmptyStringSchema,
              totalFriendCount: CountSchema,
              mutualFriendCount: CountSchema,
            }).parse
          )
      )
    }),

  getAll: protectedProcedure
    .input(
      z.object({
        friendUserId: IdSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      // const infoFriendCount1 = (db: Database) => {
      //   // eslint-disable-next-line no-console
      //   console.log(input)
      //   return db
      //     .selectFrom('friendships')
      //     .leftJoin('users', 'users.id', 'friendships.userId')
      //     .select(['friendships.userId', 'users.fullName', 'users.phoneNumber'])
      //     .where('friendships.userId', '=', ctx.session.userId)
      //     .where(
      //       'friendships.status',
      //       '=',
      //       FriendshipStatusSchema.Values['accepted']
      //     )
      // }

      // const usersDb = await db
      //   .selectFrom('users')
      //   .select(['users.id', 'users.fullName', 'users.phoneNumber'])

      //   .execute()

      // const friendshipsDb = await db
      //   .selectFrom('friendships')
      //   .select([
      //     'friendships.userId',
      //     'friendships.friendUserId',
      //     'friendships.status',
      //   ])
      //   .where(
      //     'friendships.status',
      //     '=',
      //     FriendshipStatusSchema.Values['accepted']
      //   )
      //   .execute()
      return ctx.db.connection().execute(async (conn) =>
        conn
          // const informationOfAllFriends = await db

          .selectFrom('friendships')
          .innerJoin(
            ctx.db
              .selectFrom('friendships')
              .select(['userId', 'friendUserId'])
              .where('status', '=', FriendshipStatusSchema.Values['accepted'])
              .as('f1'),
            'friendships.friendUserId',
            'f1.userId'
          )
          .leftJoin(
            ctx.db
              .selectFrom('friendships')
              .innerJoin(
                ctx.db
                  .selectFrom('friendships')
                  .select(['userId', 'friendUserId'])
                  .where(
                    'status',
                    '=',
                    FriendshipStatusSchema.Values['accepted']
                  )
                  .as('f2'),
                'friendships.friendUserId',
                'f2.userId'
              )
              .innerJoin(
                ctx.db
                  .selectFrom('friendships')
                  .select(['friendships.userId', 'friendships.friendUserId'])
                  .where('friendships.userId', '=', input.friendUserId)
                  .where(
                    'friendships.status',
                    '=',
                    FriendshipStatusSchema.Values['accepted']
                  )
                  .as('result'),
                'result.friendUserId',
                'f2.friendUserId'
              )
              .select((eb) => [
                'f2.userId',
                eb.fn.count('f2.friendUserId').as('mutualFriendCount'),
              ])
              .where('friendships.userId', '=', input.friendUserId)
              .where(
                'friendships.status',
                '=',
                FriendshipStatusSchema.Values['accepted']
              )
              .groupBy('f2.userId')
              .as('f3'),
            'f3.userId',
            'friendships.friendUserId'
          )
          .leftJoin('users', 'users.id', 'friendships.friendUserId')
          .where(
            'friendships.status',
            '=',
            FriendshipStatusSchema.Values['accepted']
          )
          .where('friendships.userId', '=', input.friendUserId)
          .select((eb) => [
            'friendships.userId',
            'friendships.friendUserId',
            'users.fullName',
            'users.phoneNumber',
            eb.fn.count('friendships.friendUserId').as('totalFriendCount'),
            'mutualFriendCount',
          ])
          .groupBy('f1.userId')
          // .executeTakeFirstOrThrow(() => new TRPCError({ code: 'NOT_FOUND' }))
          .execute()
          .then(
            z.array(
              z.object({
                userId: IdSchema,
                friendUserId: IdSchema,
                fullName: NonEmptyStringSchema,
                phoneNumber: NonEmptyStringSchema,
                totalFriendCount: CountSchema,
                mutualFriendCount: CountSchema,
              })
            ).parse
          )
      )
      // const test1 = await db
      //   .selectFrom('friendships')
      //   .select(['friendships.userId', 'friendships.friendUserId'])
      //   .where('friendships.userId', '=', ctx.session.userId)
      //   .where(
      //     'friendships.status',
      //     '=',
      //     FriendshipStatusSchema.Values['accepted']
      //   )
      //   .execute()

      // const test2 = await db
      //   .selectFrom('friendships')
      //   .select(['friendships.userId', 'friendships.friendUserId'])
      //   .where('friendships.userId', '=', input.friendUserId)
      //   .where(
      //     'friendships.status',
      //     '=',
      //     FriendshipStatusSchema.Values['accepted']
      //   )
      //   .execute()

      // const test3 = await db
      //   .selectFrom('friendships')
      //   .innerJoin(
      //     ctx.db
      //       .selectFrom('friendships')
      //       .select(['userId', 'friendUserId'])
      //       .where('status', '=', FriendshipStatusSchema.Values['accepted'])
      //       .as('test4'),
      //     'friendships.friendUserId',
      //     'test4.userId'
      //   )
      //   .innerJoin(
      //     ctx.db
      //       .selectFrom('friendships')
      //       .select(['friendships.userId', 'friendships.friendUserId'])
      //       .where('friendships.userId', '=', input.friendUserId)
      //       .where(
      //         'friendships.status',
      //         '=',
      //         FriendshipStatusSchema.Values['accepted']
      //       )
      //       .as('result'),
      //     'result.friendUserId',
      //     'test4.friendUserId'
      //   )
      //   .select((eb) => [
      //     'test4.userId',
      //     eb.fn.count('test4.friendUserId').as('mutualFriendCount'),
      //   ])
      //   .where('friendships.userId', '=', input.friendUserId)
      //   .where(
      //     'friendships.status',
      //     '=',
      //     FriendshipStatusSchema.Values['accepted']
      //   )
      //   .groupBy('test4.userId')
      //   .execute()

      // const mutualFriendCount = await db
      //   .selectFrom('friendships')
      //   .innerJoin(
      //     ctx.db
      //       .selectFrom('friendships')
      //       .select(['userId', 'friendUserId'])
      //       .where('userId', '=', input.friendUserId)
      //       .where('status', '=', FriendshipStatusSchema.Values['accepted'])
      //       .as('acceptedFriendships'),
      //     'friendships.friendUserId',
      //     'acceptedFriendships.friendUserId'
      //   )
      //   .select((eb) => [
      //     'acceptedFriendships.userId',
      //     eb.fn.count('friendships.friendUserId').as('mutualFriendCount'),
      //   ])
      //   .select(['friendships.userId', 'friendships.friendUserId'])
      //   .where('friendships.userId', '=', ctx.session.userId)
      //   .where(
      //     'friendships.status',
      //     '=',
      //     FriendshipStatusSchema.Values['accepted']
      //   )
      //   // .groupBy('acceptedFriendships.userId')
      //   .execute()

      // const resultDb = await db
      //   .selectFrom('friendships')
      //   .leftJoin('users', 'users.id', 'friendships.friendUserId')
      //   // .leftJoin( )

      //   .select([
      //     'friendships.userId',
      //     'users.id',
      //     'friendships.status',
      //     'users.fullName',
      //     'users.phoneNumber',
      //   ])
      //   .where('friendships.userId', '=', input.friendUserId)
      //   .where(
      //     'friendships.status',
      //     '=',
      //     FriendshipStatusSchema.Values['accepted']
      //   )
      //   .execute()

      // const infoFriendCount = await db
      //   .selectFrom('friendships')
      //   .leftJoin('users', 'users.id', 'friendships.userId')
      //   .select(['friendships.userId', 'users.fullName', 'users.phoneNumber'])
      //   .where('friendships.userId', '=', ctx.session.userId)
      //   .where(
      //     'friendships.status',
      //     '=',
      //     FriendshipStatusSchema.Values['accepted']
      //   )
      //   .execute()

      // // eslint-disable-next-line no-console
      // console.log(
      //   '-------------------------------------------------log-------------------------------------------------'
      // )
      // // eslint-disable-next-line no-console
      // // console.log(ctx.session.userId)
      // // eslint-disable-next-line no-console
      // // console.log(input.friendUserId)
      // // eslint-disable-next-line no-console
      // // console.log(usersDb)
      // // eslint-disable-next-line no-console
      // // console.log(friendshipsDb)
      // // eslint-disable-next-line no-console
      // console.log(informationOfAllFriends)
      // // eslint-disable-next-line no-console
      // // console.log(test1)
      // // eslint-disable-next-line no-console
      // // console.log(test2)
      // // eslint-disable-next-line no-console
      // // console.log(test3)
      // // eslint-disable-next-line no-console
      // // console.log(resultDb)
      // // eslint-disable-next-line no-console
      // // console.log(infoFriendCount)
      // // eslint-disable-next-line no-console
      // console.log(
      //   '------------------------------------------------endlog-----------------------------------------------'
      // )
    }),
})

const userTotalFriendCount = (db: Database) => {
  return db
    .selectFrom('friendships')
    .where('friendships.status', '=', FriendshipStatusSchema.Values['accepted'])
    .select((eb) => [
      'friendships.userId',
      eb.fn.count('friendships.friendUserId').as('totalFriendCount'),
    ])
    .groupBy('friendships.userId')
}
