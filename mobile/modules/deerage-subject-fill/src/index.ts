export type SubjectBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};

export type SubjectDetection = {
  boxes: SubjectBox[];
  imageWidth: number;
  imageHeight: number;
};
