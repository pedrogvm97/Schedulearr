import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

interface SortableItemProps {
    id: string;
    children: React.ReactNode;
    isDraggable: boolean;
}

export function SortableItem(props: SortableItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: props.id, disabled: !props.isDraggable });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        position: 'relative' as const,
    };

    return (
        <div ref={setNodeRef} style={style} className={`flex ${isDragging ? 'opacity-50 ring-2 ring-emerald-500 rounded-xl' : ''}`}>
            {props.isDraggable && (
                <div
                    {...attributes}
                    {...listeners}
                    className="flex items-center justify-center p-2 mr-2 cursor-grab active:cursor-grabbing text-zinc-500 hover:text-white transition-colors"
                >
                    <GripVertical size={20} />
                </div>
            )}
            <div className="flex-1">
                {props.children}
            </div>
        </div>
    );
}
