/** A session belongs to one book and only advances while the reader is visible. */
export type SessionSnapshot = { id:string;book_id:string;started_at:number;duration_seconds:number;words_read:number;updatedAt:number };

export class ReadingSessionClock {
  private active: { id:string;bookId:string;start:number;lastSeconds:number } | null = null;

  start(bookId:string,id:string,now:number) {
    if (!this.active) this.active={id,bookId,start:now,lastSeconds:0};
  }

  checkpoint(now:number): SessionSnapshot | null {
    const active=this.active;
    if (!active) return null;
    const seconds=Math.max(0,Math.floor((now-active.start)/1000));
    if (seconds<=active.lastSeconds) return null;
    active.lastSeconds=seconds;
    return {id:active.id,book_id:active.bookId,started_at:active.start,duration_seconds:seconds,words_read:Math.round(seconds*4.2),updatedAt:Math.max(now,active.start)};
  }

  pause(now:number) {
    const snapshot=this.checkpoint(now);
    this.active=null;
    return snapshot;
  }
}
