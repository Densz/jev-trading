import type { SocialContext } from "@/types/social";
import { ArrowUpRight } from "lucide-react";

export function SocialResearch({ social }: { social?: SocialContext }) {
  if (!social) return null;
  return (
    <section className="panel mb-5 overflow-hidden" aria-label="X discussion">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-medium">X discussion</h2>
        <p className="mt-2 text-[11px] leading-6 text-muted-foreground">
          {social.provider === "synthetic"
            ? "Synthetic sample posts. "
            : "Unverified supplementary discussion. "}
          Social posts do not satisfy financial or news coverage requirements.
        </p>
      </div>
      <div className="px-5 py-4 text-xs leading-6 text-muted-foreground">
        {social.status === "disabled" ? (
          <p>X was disabled for this analysis. No posts were requested.</p>
        ) : social.status === "unavailable" ? (
          <p>{social.message ?? "X posts were unavailable for this analysis."}</p>
        ) : (
          <>
            <p>
              {social.posts.length} posts included · {social.fetchedCount} returned by the
              collection · limit requested for this analysis: {social.requestedLimit}.
            </p>
            {social.fetchedAt && (
              <p className="mt-1 text-[10px]">
                Collected {new Date(social.fetchedAt).toLocaleString("en-US", { timeZone: "UTC" })}{" "}
                UTC. Cached collections may contain fewer posts than the requested limit.
              </p>
            )}
            {!!social.authors?.length && (
              <p className="mt-2">
                {social.authors.length} author profiles included. Account identity and claims have
                not been independently verified.
              </p>
            )}
            {social.authorProfilesMessage && <p className="mt-2">{social.authorProfilesMessage}</p>}
            {!social.posts.length && (
              <p className="mt-2">No relevant recent posts were returned.</p>
            )}
          </>
        )}
      </div>
      {!!social.posts.length && (
        <details className="border-t border-border">
          <summary className="cursor-pointer px-5 py-3 text-xs font-medium hover:bg-muted/30">
            View {social.posts.length} posts
          </summary>
          <div className="divide-y divide-border border-t border-border">
            {social.posts.map((post) => {
              const author = social.authors?.find((profile) => profile.id === post.authorId);
              return (
                <article key={post.id} className="px-5 py-4">
                  {author && (
                    <div className="mb-3 text-[11px] leading-5">
                      <p className="font-medium break-words">
                        {author.name}{" "}
                        <span className="text-muted-foreground">@{author.username}</span>
                      </p>
                      {author.description && (
                        <p className="mt-1 text-muted-foreground break-words">
                          {author.description}
                        </p>
                      )}
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {author.followers !== null &&
                          `${author.followers.toLocaleString("en-US")} followers · `}
                        Profile collected{" "}
                        {new Date(author.fetchedAt).toLocaleString("en-US", { timeZone: "UTC" })}{" "}
                        UTC · Identity unverified
                      </p>
                    </div>
                  )}
                  <p className="text-xs leading-6 whitespace-pre-wrap break-words">{post.text}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
                    <span>
                      {new Date(post.publishedAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC
                      {post.likes !== null && ` · ${post.likes} likes`}
                      {post.reposts !== null && ` · ${post.reposts} reposts`}
                    </span>
                    {social.provider !== "synthetic" && (
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        View on X <ArrowUpRight className="size-3" />
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </details>
      )}
    </section>
  );
}
