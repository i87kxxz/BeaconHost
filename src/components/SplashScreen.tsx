import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import AnimatedBackground from "./AnimatedBackground";

export default function SplashScreen({
  onDone,
}: {
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 1600);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence onExitComplete={onDone}>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-[100] flex items-center justify-center"
        >
          <AnimatedBackground />
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.5 }}
            className="splash-logo flex flex-col items-center gap-5 px-6"
          >
            <img
              src="/logo_intro.png"
              alt={t("app.name")}
              className="max-h-[min(42vh,320px)] w-auto max-w-[min(92vw,560px)] object-contain drop-shadow-[0_0_48px_rgba(42,184,243,0.35)]"
              draggable={false}
            />
            <p className="text-sm text-beacon-ice/70">{t("app.tagline")}</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
