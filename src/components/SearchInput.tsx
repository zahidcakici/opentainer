import React from 'react';
import { Search, X } from 'lucide-react';

interface SearchInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    style?: React.CSSProperties;
}

const SearchInput: React.FC<SearchInputProps> = ({ value, onChange, placeholder = 'Search...', style }) => {
    return (
        <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            width: '240px',
            ...style
        }}>
            <Search
                size={14}
                style={{
                    position: 'absolute',
                    left: '10px',
                    color: 'var(--text-muted)',
                    pointerEvents: 'none'
                }}
            />
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                style={{
                    width: '100%',
                    padding: '8px 32px 8px 32px',
                    fontSize: '13px',
                    background: 'var(--bg-app)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    transition: 'all 0.2s',
                }}
                onFocus={(e) => {
                    e.target.style.borderColor = 'var(--status-running)';
                    e.target.style.boxShadow = '0 0 0 2px rgba(34, 197, 94, 0.1)';
                }}
                onBlur={(e) => {
                    e.target.style.borderColor = 'var(--border-subtle)';
                    e.target.style.boxShadow = 'none';
                }}
            />
            {value && (
                <button
                    onClick={() => onChange('')}
                    style={{
                        position: 'absolute',
                        right: '8px',
                        padding: '4px',
                        color: 'var(--text-muted)',
                        background: 'transparent',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                    className="hover-bg"
                >
                    <X size={12} />
                </button>
            )}
        </div>
    );
};

export default SearchInput;
