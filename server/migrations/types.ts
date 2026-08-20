export type Migration = {
  id: string;
  up: () => void;
  down?: () => void;
};
