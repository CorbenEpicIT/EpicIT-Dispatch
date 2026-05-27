import { useDispatcherByIdQuery, useDeleteDispatcherMutation } from "../../hooks/useDispatchers";
import EditDispatcher from "../../components/dispatchers/EditDispatcher";
import { groupPermissionsByCategory } from "../../lib/permissionCatalogs";
import { useNavigate, useParams } from "react-router-dom";


const DispatcherDetailPage = () => {
    const { dispatcherId } = useParams();
    const { data: dispatcher, isLoading } = useDispatcherByIdQuery(dispatcherId!);
    const deleteDispatcherMutation = useDeleteDispatcherMutation();
    const navigate = useNavigate();

    
    return (
        <>
            {isLoading ? (
                <div className="flex justify-center py-10">
                    <span className="text-sm text-text-secondary">Loading...</span>
                </div>
            ) : (
                <div className="p-4">
                    <h1 className="text-xl font-bold mb-4">Dispatcher Details</h1>
                    {dispatcher && (
                        <div>
                            <p><strong>Name:</strong> {dispatcher.name}</p>
                            <p><strong>Email:</strong> {dispatcher.email}</p>
                            <p><strong>Phone:</strong> {dispatcher.phone}</p>
                        </div>
                    )}
                </div>
            )}
        </>
    );
}

export default DispatcherDetailPage;