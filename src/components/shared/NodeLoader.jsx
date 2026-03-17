import { motion, AnimatePresence } from "framer-motion";

export default function NodeLoader({ text = "Loading" }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
      {/* Outer rings */}
      <div className="relative w-24 h-24 flex items-center justify-center">
        <motion.div
          className="absolute inset-0 rounded-full border border-border/40"
          animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute inset-2 rounded-full border border-border/30"
          animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0, 0.4] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
        />
        <motion.div
          className="text-4xl font-light select-none text-foreground"
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        >
          ✱
        </motion.div>
      </div>

      {text && (
        <motion.div
          className="mt-10 text-center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <p className="text-[11px] tracking-[0.3em] uppercase text-muted-foreground/60">{text}</p>
          <motion.div className="flex items-center justify-center gap-1 mt-3">
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                className="w-1 h-1 rounded-full bg-muted-foreground/30"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}