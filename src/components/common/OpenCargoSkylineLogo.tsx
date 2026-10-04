import React from 'react';

interface OpenCargoSkylineLogoProps {
  className?: string;
}

export const OpenCargoSkylineLogo: React.FC<OpenCargoSkylineLogoProps> = ({ className = 'w-full h-auto' }) => {
  return (
    <svg
      viewBox="0 0 1000 130"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Silueta de Edificio/Depósito, Barco de Carga y Avión Despegando (Alta Precisión HD sin texto) */}
      <path
        d="M 5 95 
           L 110 95 
           L 110 32 
           L 260 32 
           L 260 52 
           L 272 52 
           L 285 70 
           L 285 88 
           L 290 95 
           L 380 95 
           L 368 76 
           L 388 62 
           L 395 76 
           L 412 76 
           L 412 28 
           L 418 28 
           L 418 76 
           L 520 76 
           L 520 48 
           L 548 48 
           L 548 76 
           L 575 76 
           L 575 82 
           L 598 82 
           L 605 76 
           L 615 88 
           L 625 88 
           L 638 72 
           L 648 95 
           L 755 95 
           L 760 76 
           L 785 76 
           L 790 70 
           C 820 42, 860 22, 915 10 
           C 925 8, 930 14, 918 24 
           C 890 48, 850 72, 815 90 
           C 835 84, 860 84, 885 84 
           C 892 95, 875 98, 845 102 
           C 820 106, 795 110, 778 114 
           L 772 122 
           L 785 116 
           C 805 122, 840 122, 875 122 
           L 995 122"
        stroke="black"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
