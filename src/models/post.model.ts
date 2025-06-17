// A simplified version for the search service's context
export interface IndexedPost {
    postId: string;
    userId: string;
    title: string;
    content: string;
    createdAt?: Date;
    updatedAt?: Date;
    likeCount?: number;
  }
  
  // Model for the incoming Kafka event from the post-service
  export interface PostCreatedEventData extends IndexedPost {
    eventType: 'PostCreated';
    eventTimestamp: string;
  }
  
  // We can define other events, but for simplicity, we'll only handle PostCreated.
  export type PostLifecycleEvent = PostCreatedEventData; // Add other event types here if needed