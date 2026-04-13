import { useEffect, useRef, useState } from 'react';

const CHEVRON = '\u25BE';

export default function CountryCodePicker({ countries, language, value, onSelect }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const selectedCountry = countries.find((country) => country.code === value) || countries[0];

  useEffect(() => {
    function handleOutsideClick(event) {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  function handleSelect(code) {
    onSelect(code);
    setOpen(false);
  }

  return (
    <div className={`country-picker ${open ? 'is-open' : ''}`} ref={containerRef}>
      <button
        type="button"
        className="country-picker-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="country-picker-code" dir="ltr">{selectedCountry?.code || value}</span>
        <span className="country-picker-chevron" aria-hidden="true">{CHEVRON}</span>
      </button>

      {open && (
        <div className="country-picker-menu" role="listbox">
          {countries.map((country) => (
            <button
              key={country.code}
              type="button"
              className={`country-picker-option ${country.code === value ? 'active' : ''}`}
              onClick={() => handleSelect(country.code)}
            >
              <span className="country-picker-option-code" dir="ltr">{country.code}</span>
              <span className="country-picker-option-name">{language === 'ar' ? country.ar : country.en}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
