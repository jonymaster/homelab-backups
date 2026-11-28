import {
  BellRingIcon,
  HashIcon,
  LinkIcon,
  MailIcon,
  MessageSquareIcon,
  RadioTowerIcon,
  SendIcon,
  SmartphoneIcon,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  ntfy: BellRingIcon,
  gotify: RadioTowerIcon,
  telegram: SendIcon,
  discord: MessageSquareIcon,
  slack: HashIcon,
  pushover: SmartphoneIcon,
  email: MailIcon,
  apprise: LinkIcon,
};

const BLURBS: Record<string, string> = {
  ntfy: "Push to your phone, self-hosted or ntfy.sh",
  gotify: "Self-hosted push server",
  telegram: "Message from your own bot",
  discord: "Post to a channel webhook",
  slack: "Post to an incoming webhook",
  pushover: "Push to iOS and Android",
  email: "Any SMTP server",
  apprise: "Any of 90+ services by URL",
};

export const channelIcon = (type: string): LucideIcon => ICONS[type] ?? BellRingIcon;
export const channelBlurb = (type: string): string | undefined => BLURBS[type];
