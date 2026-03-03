"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useSetMyProfile } from "@/lib/hooks/useSetMyProfile";

const EMOJI_OPTIONS = [
  "\u{1F33F}", "\u{1F332}", "\u{1F33B}", "\u{1F33E}", "\u{1F341}",
  "\u{1F335}", "\u{1F340}", "\u{1F490}",
  "\u{1F527}", "\u{2699}\u{FE0F}", "\u{1F4BB}", "\u{1F4A1}", "\u{1F50C}",
  "\u{26A1}", "\u{1F525}", "\u{1F30A}", "\u{2744}\u{FE0F}", "\u{2728}",
  "\u{1F680}", "\u{1F30D}", "\u{1F310}", "\u{2B50}", "\u{1F319}",
  "\u{1F3D7}\u{FE0F}", "\u{1F3AF}", "\u{1F3A8}", "\u{1F9E9}",
  "\u{1F91D}", "\u{1F9EC}", "\u{1F3B5}", "\u{1F4DA}",
  "\u{1F41D}", "\u{1F98B}", "\u{1F40C}", "\u{1F419}",
];

interface ProfileEditorProps {
  currentName: string;
  currentEmoji: string;
  currentRole: string;
}

export default function ProfileEditor({
  currentName,
  currentEmoji,
  currentRole,
}: ProfileEditorProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [emoji, setEmoji] = useState(currentEmoji);
  const [role, setRole] = useState(currentRole);

  const { submit, isPending, isConfirming, isSuccess, error } = useSetMyProfile();

  useEffect(() => {
    if (open) {
      setName(currentName);
      setEmoji(currentEmoji);
      setRole(currentRole);
    }
  }, [open, currentName, currentEmoji, currentRole]);

  useEffect(() => {
    if (isSuccess) {
      const timer = setTimeout(() => setOpen(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [isSuccess]);

  const isSubmitting = isPending || isConfirming;

  return (
    <Dialog open={open} onOpenChange={(v) => !isSubmitting && setOpen(v)}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Edit Profile</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md text-foreground">
        <DialogHeader>
          <DialogTitle className="text-foreground">Edit Profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              disabled={isSubmitting}
              className="h-8 text-foreground"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Emoji <span className="text-foreground ml-1">{emoji}</span>
            </label>
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1 border border-border rounded-md bg-muted/30">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={`h-8 w-8 rounded text-lg flex items-center justify-center transition-colors ${
                    emoji === e
                      ? "bg-primary text-primary-foreground ring-1 ring-ring"
                      : "hover:bg-accent"
                  }`}
                  onClick={() => setEmoji(e)}
                  disabled={isSubmitting}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Role</label>
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              maxLength={128}
              disabled={isSubmitting}
              className="h-8 text-foreground"
            />
          </div>

          {isSuccess && (
            <p className="text-sm text-green-500 text-center">Profile updated!</p>
          )}
          {error && (
            <p className="text-sm text-destructive text-center truncate">
              {error.message?.slice(0, 120) ?? "Transaction failed"}
            </p>
          )}

          <Button
            onClick={() => submit(name.trim(), emoji, role.trim())}
            disabled={!name.trim() || isSubmitting}
            className="w-full"
          >
            {isSubmitting ? "Saving..." : "Save Profile"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
