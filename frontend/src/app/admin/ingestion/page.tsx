import { redirect } from "next/navigation";

export default function AdminIngestionPage() {
    redirect("/admin/question-bank/bulk-import");
}
