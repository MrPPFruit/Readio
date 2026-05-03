export const shouldEnablePageTurnAnimation = ({
  animated,
  isEink,
  isAndroidApp,
}: {
  animated: boolean;
  isEink: boolean;
  isAndroidApp: boolean;
}) => {
  return animated || (isAndroidApp && !isEink);
};
