# Welcome to your Convex functions directory!

Write your Convex functions here.
See https://docs.convex.dev/functions for more.

A query function that takes two arguments looks like:

```ts
// convex/myFunctions.ts
import { query } from "./_generated/server";
import { v } from "convex/values";

export const myQueryFunction = query({
  // Validators for arguments.
  args: {
    first: v.number(),
    second: v.string(),
  },

  // Function implementation.
  handler: async (ctx, args) => {
    // Read the database as many times as you need here.
    // See https://docs.convex.dev/database/reading-data.
    const documents = await ctx.db.query("tablename").collect();

    // Arguments passed from the client are properties of the args object.
    console.log(args.first, args.second);

    // Write arbitrary JavaScript here: filter, aggregate, build derived data,
    // remove non-public properties, or create new objects.
    return documents;
  },
});
```

Using this query function in a React component looks like:

```ts
const data = useQuery(api.myFunctions.myQueryFunction, {
  first: 10,
  second: "hello",
});
```

A mutation function looks like:

```ts
// convex/myFunctions.ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const myMutationFunction = mutation({
  // Validators for arguments.
  args: {
    first: v.string(),
    second: v.string(),
  },

  // Function implementation.
  handler: async (ctx, args) => {
    // Insert or modify documents in the database here.
    // Mutations can also read from the database like queries.
    // See https://docs.convex.dev/database/writing-data.
    const message = { body: args.first, author: args.second };
    const id = await ctx.db.insert("messages", message);

    // Optionally, return a value from your mutation.
    return await ctx.db.get(id);
  },
});
```

Using this mutation function in a React component looks like:

```ts
const mutation = useMutation(api.myFunctions.myMutationFunction);
function handleButtonPress() {
  // fire and forget, the most common way to use mutations
  mutation({ first: "Hello!", second: "me" });
  // OR
  // use the result once the mutation has completed
  mutation({ first: "Hello!", second: "me" }).then((result) =>
    console.log(result),
  );
}
```

Use the Convex CLI to push your functions to a deployment. See everything
the Convex CLI can do by running `npx convex -h` in your project root
directory. To learn more, launch the docs with `npx convex docs`.

## Yapily banking

Bank connection secrets are backend-only Convex environment variables:

- `YAPILY_APPLICATION_ID`
- `YAPILY_APPLICATION_SECRET`
- `YAPILY_CALLBACK_URL`
- `APP_BASE_URL`
- Optional `YAPILY_API_BASE_URL`

Set them with `npx convex env set`. Do not expose these values through `VITE_*` variables.
`APP_BASE_URL` is the public frontend origin used after Yapily redirects back to the Convex callback. It is required outside local development.

The active flow discovers compatible UK banks directly from Yapily:

1. Admin or Finance Team opens Settings > Bank Connections.
2. ChurchCoin fetches the current UK institution list and filters it to account-authorisation, account, and transaction support.
3. The user selects a bank and is redirected through Yapily consent.
4. Yapily redirects back to `/yapily/callback`; the callback claims its single-use state and schedules the one-time-token exchange.
5. Each returned account is mapped to a fund.
6. Transactions are fetched on demand from the Transactions screen and reviewed before import.

Production access requires a Yapily application with the required UK institutions
enabled and an agreed regulatory route, such as Yapily Connect delegated AISP
licensing.
