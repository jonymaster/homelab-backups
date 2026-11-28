export interface StatusMeta {
  label: string;
  className: string;
  running: boolean;
}

// The backend reports finished jobs as "success" (older versions: "completed").
export function statusMeta(status: string): StatusMeta {
  switch (status) {
    case "success":
    case "completed":
      return {
        label: "Success",
        className: "bg-green-900/50 text-green-400",
        running: false,
      };
    case "running":
      return {
        label: "Running",
        className: "bg-orange-900/50 text-orange-400",
        running: true,
      };
    case "pending":
      return {
        label: "Pending",
        className: "bg-blue-900/50 text-blue-400",
        running: false,
      };
    default:
      return {
        label: "Failed",
        className: "bg-red-900/50 text-red-400",
        running: false,
      };
  }
}
