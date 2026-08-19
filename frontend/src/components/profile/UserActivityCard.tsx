import ActivityFeed from "../dashboard/ActivityFeed";
import { useAuthStore } from "../../auth/authStore";

export default function UserActivityCard(){
    const {user} = useAuthStore();

    return (
        <ActivityFeed title="My Activity" userId={user?.userId} />
    )
}