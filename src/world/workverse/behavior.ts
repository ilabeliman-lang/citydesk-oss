import type { AgentState, WorkverseFloorLayout } from "./types";

export interface AgentBehaviorState {
  agentId: string;
  currentState: AgentState;
  currentPosition: [number, number, number];
  targetPosition: [number, number, number] | null;
  deskPosition: [number, number, number];
  activityTimer: number;
  activity: 'desk_work' | 'coffee' | 'couch' | 'bookshelf' | 'water_cooler' | 'window' | 'walking';
}

const BREAK_ROOM_SPOTS: { activity: AgentBehaviorState['activity'], pos: [number, number, number] }[] = [
  { activity: 'couch', pos: [5.4, 0, 5.8] },
  { activity: 'coffee', pos: [5.4, 0, 6.8] },
  { activity: 'water_cooler', pos: [8.8, 0, 6.5] },
  { activity: 'coffee', pos: [8.8, 0, 5.6] },
  { activity: 'window', pos: [0, 0, 7.5] },
  { activity: 'bookshelf', pos: [-2.3, 0, -2.5] }
];

const WALKING_SPEED = 1.2;

export function tickBehavior(
  agent: AgentBehaviorState,
  dt: number,
  layout: WorkverseFloorLayout
): AgentBehaviorState {
  const next = { ...agent };
  
  if (next.currentState === 'paused') {
    if (next.activity !== 'couch') {
      next.activity = 'couch';
      next.currentPosition = [5.4, 0, 5.8];
      next.targetPosition = null;
    }
    return next;
  }
  
  if (next.currentState === 'waiting') {
    next.activity = 'desk_work';
    next.currentPosition = [...next.deskPosition];
    next.targetPosition = null;
    return next;
  }

  if (next.targetPosition) {
    next.activity = 'walking';
    const dx = next.targetPosition[0] - next.currentPosition[0];
    const dz = next.targetPosition[2] - next.currentPosition[2];
    const dist = Math.sqrt(dx * dx + dz * dz);
    
    if (dist < 0.1) {
      next.currentPosition = [...next.targetPosition];
      next.targetPosition = null;
      
      const isAtDesk = Math.abs(next.currentPosition[0] - next.deskPosition[0]) < 0.1 && 
                       Math.abs(next.currentPosition[2] - next.deskPosition[2]) < 0.1;
                       
      if (isAtDesk) {
        next.activity = 'desk_work';
        next.activityTimer = 20 + Math.random() * 20;
      } else {
        const spot = BREAK_ROOM_SPOTS.find(s => 
          Math.abs(s.pos[0] - next.currentPosition[0]) < 0.1 && 
          Math.abs(s.pos[2] - next.currentPosition[2]) < 0.1
        );
        if (spot) {
          next.activity = spot.activity;
          next.activityTimer = 8 + Math.random() * 7;
        } else {
          next.activity = 'desk_work';
          next.activityTimer = 20;
        }
      }
    } else {
      const moveDist = WALKING_SPEED * dt;
      if (moveDist >= dist) {
        next.currentPosition = [...next.targetPosition];
      } else {
        next.currentPosition = [
          next.currentPosition[0] + (dx / dist) * moveDist,
          next.currentPosition[1],
          next.currentPosition[2] + (dz / dist) * moveDist,
        ];
      }
      return next;
    }
  }

  next.activityTimer -= dt;
  if (next.activityTimer <= 0) {
    if (next.currentState === 'working') {
      if (next.activity === 'desk_work') {
        if (Math.random() < 0.15) {
          next.currentState = 'idle';
          const spot = BREAK_ROOM_SPOTS[Math.floor(Math.random() * BREAK_ROOM_SPOTS.length)];
          next.targetPosition = [...spot.pos];
        } else {
          next.activityTimer = 20 + Math.random() * 20;
        }
      } else {
        next.targetPosition = [...next.deskPosition];
      }
    } else if (next.currentState === 'idle') {
      if (next.activity === 'desk_work') {
        const spot = BREAK_ROOM_SPOTS[Math.floor(Math.random() * BREAK_ROOM_SPOTS.length)];
        next.targetPosition = [...spot.pos];
      } else {
        next.targetPosition = [...next.deskPosition];
        next.currentState = 'working';
      }
    }
  }

  return next;
}
