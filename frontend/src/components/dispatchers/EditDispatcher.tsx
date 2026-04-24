import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Dispatcher, UpdateDispatcherInput } from "../../types/dispatchers";
import { useUpdateDispatcherMutation } from "../../hooks/useDispatchers";
import { FormWizardContainer } from "../ui/forms/FormWizardContainer";
import DatePicker from "../ui/DatePicker";
import Dropdown from "../ui/Dropdown";

interface EditDispatcherProps {
    isOpen: boolean;
    onClose: () => void;
    dispatcher: Dispatcher;
}

const ROLE_ENTRIES = (
    <>
        <option value="dispatcher">Dispatcher</option>
        <option value="admin">Admin</option>
    </>
);

const INPUT =
    "border border-zinc-700 px-2.5 h-[34px] w-full rounded bg-zinc-900 text-white text-sm lg:text-base focus:border-blue-500 focus:outline-none transition-colors min-w-0";
const LABEL = "block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider";

export default function EditDispatcher({ isOpen, onClose, dispatcher }: EditDispatcherProps) {
    const navigate = useNavigate();

    const [name, setName] = useState(dispatcher.name);
    const [email, setEmail] = useState(dispatcher.email);
    const [phone, setPhone] = useState(dispatcher.phone);
    const [title, setTitle] = useState(dispatcher.title);
    const [description, setDescription] = useState(dispatcher.description || "");
    const [role, setRole] = useState<UpdateDispatcherInput["role"]>(dispatcher.role);

    const updateDispatcher = useUpdateDispatcherMutation();

    const isLoading = updateDispatcher.isPending;

    useEffect(() => {
        if (isOpen) {
            setName(dispatcher.name);
            setEmail(dispatcher.email);
            setPhone(dispatcher.phone);
            setTitle(dispatcher.title);
            setDescription(dispatcher.description || "");
            setRole(dispatcher.role);
        }
    }, [isOpen, dispatcher]);

    const handleSubmit = async () => {
        try {
            await updateDispatcher.mutateAsync({
                id: dispatcher.id,
                data: {
                    name,
                    email,
                    phone,
                    title,
                    description,
                    role,
                },
            });
            onClose();
        } catch (error) {
            console.error("Failed to update dispatcher:", error);
        }
    };

    const isFormValid = useMemo(
        () => !!(name.trim() && email.trim() && phone?.trim() && title.trim()),
        [name, email, phone, title]
    );

    const formContent = useMemo(
        () => (
            <div className="space-y-2 lg:space-y-3 xl:space-y-4 min-w-0">
                {/* Name */}
                <div className="min-w-0">
                    <label className={LABEL}>Full Name *</label>
                    <input
                        type="text"
                        placeholder="Full Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={INPUT}
                        disabled={isLoading}
                    />
                </div>

                {/* Email + Phone */}
                <div className="grid grid-cols-2 gap-2 lg:gap-3 min-w-0">
                    <div className="min-w-0">
                        <label className={LABEL}>Email *</label>
                        <input
                            type="email"
                            placeholder="email@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className={INPUT}
                            disabled={isLoading}
                        />
                    </div>
                    <div className="min-w-0">
                        <label className={LABEL}>Phone *</label>
                        <input
                            type="tel"
                            placeholder="(555) 123-4567"
                            value={phone?.trim() ? phone : ""}
                            onChange={(e) => setPhone(e.target.value)}
                            className={INPUT}
                            disabled={isLoading}
                        />
                    </div>
                </div>

                {/* Title */}
                <div className="min-w-0">
                    <label className={LABEL}>Title *</label>
                    <input
                        type="text"
                        placeholder="e.g. Senior Dispatcher"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className={INPUT}
                        disabled={isLoading}
                    />
                </div>

                {/* Description */}
                <div className="min-w-0">
                    <label className={LABEL}>Description</label>
                    <textarea
                        placeholder="Brief description or notes..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="border border-zinc-700 px-2.5 py-1.5 lg:py-2 w-full h-14 lg:h-20 xl:h-24 rounded bg-zinc-900 text-white text-sm lg:text-base resize-none focus:border-blue-500 focus:outline-none transition-colors min-w-0"
                        disabled={isLoading}
                    />
                </div>

                {/* Role */}
                <div className="grid grid-cols-2 gap-2 lg:gap-3 min-w-0">
                    <div className="min-w-0">
                        <label className={LABEL}>Role</label>
                        <Dropdown
                            entries={ROLE_ENTRIES}
                            value={role?.toLocaleLowerCase() || "dispatcher"}
                            onChange={(v) =>
                                setRole(
                                    v as UpdateDispatcherInput["role"]
                                )
                            }
                            disabled={isLoading}
                        />
                    </div>
                </div>
            </div>
        ),
        [name, email, phone, title, description, role, isLoading]
    );

    return (
        <FormWizardContainer
            title="Edit Dispatcher"
            steps={[]}
            currentStep={1}
            visitedSteps={new Set([1])}
            isLoading={updateDispatcher.isPending}
            isOpen={isOpen}
            onClose={onClose}
            onSubmit={handleSubmit}
            canGoNext={isFormValid}
            submitLabel="Save Changes"
            isEditMode
        >
            {formContent}
        </FormWizardContainer>
    );
}
