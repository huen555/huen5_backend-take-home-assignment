import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { FriendshipStatusSchema } from '@/utils/server/friendship-schemas'
import { authGuard } from '@/server/trpc/middlewares/auth-guard'
import { procedure } from '@/server/trpc/procedures'
import { IdSchema } from '@/utils/server/base-schemas'
import { router } from '@/server/trpc/router'

const SendFriendshipRequestInputSchema = z.object({
  friendUserId: IdSchema,
})

const canSendFriendshipRequest = authGuard.unstable_pipe(
  async ({ ctx, rawInput, next }) => {
    const { friendUserId } = SendFriendshipRequestInputSchema.parse(rawInput)

    await ctx.db
      .selectFrom('users')
      .where('users.id', '=', friendUserId)
      .select('id')
      .limit(1)
      .executeTakeFirstOrThrow(
        () =>
          new TRPCError({
            code: 'BAD_REQUEST',
          })
      )

    return next({ ctx })
  }
)

const AnswerFriendshipRequestInputSchema = z.object({
  friendUserId: IdSchema,
})

const canAnswerFriendshipRequest = authGuard.unstable_pipe(
  async ({ ctx, rawInput, next }) => {
    const { friendUserId } = AnswerFriendshipRequestInputSchema.parse(rawInput)

    await ctx.db
      .selectFrom('friendships')
      .where('friendships.userId', '=', friendUserId)
      .where('friendships.friendUserId', '=', ctx.session.userId)
      .where(
        'friendships.status',
        '=',
        FriendshipStatusSchema.Values['requested']
      )
      .select('friendships.id')
      .limit(1)
      .executeTakeFirstOrThrow(() => {
        throw new TRPCError({
          code: 'BAD_REQUEST',
        })
      })

    return next({ ctx })
  }
)

export const friendshipRequestRouter = router({
  send: procedure
    .use(canSendFriendshipRequest)
    .input(SendFriendshipRequestInputSchema)
    .mutation(async ({ ctx, input }) => {
      /**
       * Question 3: Fix bug
       *
       * Fix a bug where our users could not send a friendship request after
       * they'd previously been declined. Steps to reproduce:
       *  1. User A sends a friendship request to User B
       *  2. User B declines the friendship request
       *  3. User A tries to send another friendship request to User B -> ERROR
       *
       * Instructions:
       *  - Go to src/server/tests/friendship-request.test.ts, enable the test
       * scenario for Question 3
       *  - Run `yarn test` to verify your answer
       */
      // return ctx.db
      //   .insertInto('friendships')
      //   .values({
      //     userId: ctx.session.userId,
      //     friendUserId: input.friendUserId,
      //     status: FriendshipStatusSchema.Values['requested'],
      //   })
      //   .execute()

      const [userId, friendUserId] = [ctx.session.userId, input.friendUserId]

      // Flag data: have been declined friend request? (2 case)
      const dataFlag = await ctx.db
        .selectFrom('friendships')
        .select(['userId'])
        .where('userId', '=', userId)
        .where('friendUserId', '=', friendUserId)
        .where('status', '=', 'declined')
        .execute()
      if (Object.keys(dataFlag).length === 0) {
        // Case 1: not refused yet
        return ctx.db
          .insertInto('friendships')
          .values({
            userId: ctx.session.userId,
            friendUserId: input.friendUserId,
            status: FriendshipStatusSchema.Values['requested'],
          })
          .execute()
      } else {
        // case 2: refused
        return ctx.db
          .updateTable('friendships')
          .set({ status: 'requested' })
          .where('friendships.userId', '=', userId)
          .where('friendships.friendUserId', '=', friendUserId)
          .execute()
      }
    }),

  accept: procedure
    .use(canAnswerFriendshipRequest)
    .input(AnswerFriendshipRequestInputSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction().execute(async (t) => {
        /**
         * Question 1: Implement api to accept a friendship request
         *
         * When a user accepts a friendship request, we need to:
         *  1. Update the friendship request to have status `accepted`
         *  2. Create a new friendship request record with the opposite user as the friend
         *
         * The end result that we want will look something like this
         *
         *  | userId | friendUserId | status   |
         *  | ------ | ------------ | -------- |
         *  | 1      | 2            | accepted |
         *  | 2      | 1            | accepted |
         *
         * Instructions:
         *  - Your answer must be inside this transaction code block
         *  - Run `yarn test` to verify your answer
         *
         * Documentation references:
         *  - https://kysely-org.github.io/kysely/classes/Transaction.html#transaction
         *  - https://kysely-org.github.io/kysely/classes/Kysely.html#insertInto
         *  - https://kysely-org.github.io/kysely/classes/Kysely.html#updateTable
         */

        const [userId, friendUserId] = [ctx.session.userId, input.friendUserId]

        // Update status 'accepted'
        await t
          .updateTable('friendships')
          .set({ status: 'accepted' })
          .where('friendships.userId', '=', friendUserId)
          .where('friendships.friendUserId', '=', userId)
          .execute()

        // Flag data: 2 requests at the same time (2 case)
        const dataFlag = await t
          .selectFrom('friendships')
          .select(['userId'])
          .where('userId', '=', userId)
          .where('friendUserId', '=', friendUserId)
          .where('status', '=', 'requested')
          .execute()

        if (Object.keys(dataFlag).length === 0) {
          // Case 1: only 1 request
          await t
            .insertInto('friendships')
            .values({
              userId: userId,
              friendUserId: friendUserId,
              status: 'accepted',
            })
            .execute()
        } else {
          // case 2: 2 requests at the same time
          await t
            .updateTable('friendships')
            .set({ status: 'accepted' })
            .where('friendships.userId', '=', userId)
            .where('friendships.friendUserId', '=', friendUserId)
            .execute()
        }
      })
    }),

  decline: procedure
    .use(canAnswerFriendshipRequest)
    .input(AnswerFriendshipRequestInputSchema)
    .mutation(async ({ ctx, input }) => {
      /**
       * Question 2: Implement api to decline a friendship request
       *
       * Set the friendship request status to `declined`
       *
       * Instructions:
       *  - Go to src/server/tests/friendship-request.test.ts, enable the test
       * scenario for Question 2
       *  - Run `yarn test` to verify your answer
       *
       * Documentation references:
       *  - https://vitest.dev/api/#test-skip
       */

      // Update status 'declined'
      const [userId, friendUserId] = [ctx.session.userId, input.friendUserId]
      return await ctx.db
        .updateTable('friendships')
        .set({ status: 'declined' })
        .where('friendships.userId', '=', friendUserId)
        .where('friendships.friendUserId', '=', userId)
        .where('friendships.status', '=', 'requested')
        .execute()
    }),
})
